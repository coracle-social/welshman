import type {Subscriber} from "svelte/store"
import {writable} from "svelte/store"
import type {Override} from "@welshman/lib"
import {
  append,
  TaskQueue,
  ifLet,
  ensurePlural,
  remove,
  defer,
  sleep,
  nth,
  without,
} from "@welshman/lib"
import {HashedEvent, EventTemplate, SignedEvent, isSignedEvent, WRAPPED_KINDS} from "@welshman/util"
import {
  publish,
  PublishStatus,
  PublishResult,
  PublishOptions,
  PublishResultsByRelay,
} from "@welshman/net"
import {ISigner, Nip59, prep} from "@welshman/signer"
import {repository, tracker} from "./core.js"
import {pubkey, signer, wrapManager} from "./session.js"

export type ThunkOptions = Override<
  PublishOptions,
  {
    event: EventTemplate
    recipient?: string
    delay?: number
  }
>

export class Thunk {
  _subs: Subscriber<Thunk>[] = []

  pubkey: string
  signer: ISigner
  event: HashedEvent
  results: PublishResultsByRelay = {}
  complete = defer<void>()
  controller = new AbortController()
  wrap?: SignedEvent

  constructor(readonly options: ThunkOptions) {
    if (!options.recipient && WRAPPED_KINDS.includes(options.event.kind)) {
      throw new Error(`Attempted to publish a kind ${options.event.kind} without wrapping it`)
    }

    const $pubkey = pubkey.get()

    if (!$pubkey) {
      throw new Error(`Attempted to publish an event without an active pubkey`)
    }

    const $signer = signer.get()

    if (!$signer) {
      throw new Error(`Attempted to publish an event without an active signer`)
    }

    this.pubkey = $pubkey
    this.signer = $signer
    this.event = prep(options.event, this.pubkey)

    for (const relay of options.relays) {
      this.results[relay] = {
        relay,
        status: PublishStatus.Sending,
        detail: "sending...",
      }
    }

    this.controller.signal.addEventListener("abort", () => {
      for (const relay of options.relays) {
        this._setAborted({
          relay,
          status: PublishStatus.Aborted,
          detail: "aborted",
        })
      }
    })
  }

  _notify() {
    for (const subscriber of this._subs) {
      subscriber(this)
    }
  }

  _fail(detail: string) {
    for (const relay of this.options.relays) {
      this.results[relay] = {
        relay,
        status: PublishStatus.Failure,
        detail: detail,
      }
    }

    this._notify()
  }

  _setPending = (result: PublishResult) => {
    this.options.onPending?.(result)
    this.results[result.relay] = result
    this._notify()
  }

  _setTimeout = (result: PublishResult) => {
    this.options.onTimeout?.(result)
    this.results[result.relay] = result
    this._notify()
  }

  _setAborted = (result: PublishResult) => {
    this.options.onAborted?.(result)
    this.results[result.relay] = result
    this._notify()
  }

  async _publish(event: SignedEvent) {
    // Wait if the thunk is to be delayed
    if (this.options.delay) {
      await sleep(this.options.delay)
    }

    // Skip publishing if aborted
    if (this.controller.signal.aborted) {
      return
    }

    // Send it off
    await publish({
      ...this.options,
      event,
      onSuccess: (result: PublishResult) => {
        this.options.onSuccess?.(result)
        this.results[result.relay] = result
        this._notify()
      },
      onFailure: (result: PublishResult) => {
        this.options.onFailure?.(result)
        this.results[result.relay] = result
        this._notify()
      },
      onPending: this._setPending,
      onTimeout: this._setTimeout,
      onAborted: this._setAborted,
      onComplete: (result: PublishResult) => {
        if (result.status !== PublishStatus.Success) {
          tracker.removeRelay(event.id, result.relay)
        }

        this.options.onComplete?.(result)
        this._subs = []
      },
    })

    // Notify the caller that we're done
    this.complete.resolve()
  }

  async publish() {
    // Handle abort immediately if possible
    if (this.controller.signal.aborted) return

    const {recipient} = this.options

    // If we're sending it privately, wrap the event using nip 59
    if (recipient) {
      const nip59 = Nip59.fromSigner(this.signer)

      this.wrap = await nip59.wrap(recipient, this.event)

      wrapManager.add({recipient, wrap: this.wrap, rumor: this.event})

      return this._publish(this.wrap)
    }

    // If the event has been signed, we're good to go
    if (isSignedEvent(this.event)) {
      return this._publish(this.event)
    }

    // Allow for lazily signing events in order to decrease apparent latency in the UI
    // that results from waiting for remote signers
    try {
      const signedEvent = await this.signer.sign(this.event, {
        signal: AbortSignal.timeout(30_000),
      })

      // Copy the signature over since we deferred signing
      ifLet(repository.getEvent(signedEvent.id), savedEvent => {
        savedEvent.sig = signedEvent.sig
      })

      return this._publish(signedEvent)
    } catch (e: any) {
      return this._fail(String(e || "Failed to sign event"))
    }
  }

  enqueue() {
    thunkQueue.push(this)

    for (const url of this.options.relays) {
      tracker.track(this.event.id, url)
    }

    repository.publish(this.event)
    thunks.update($thunks => append(this, $thunks))

    this.controller.signal.addEventListener("abort", () => {
      if (this.wrap) {
        wrapManager.remove(this.wrap.id)
      } else {
        repository.removeEvent(this.event.id)
      }

      thunks.update($thunks => remove(this, $thunks))
    })
  }

  subscribe(subscriber: Subscriber<Thunk>) {
    this._subs.push(subscriber)

    subscriber(this)

    return () => {
      this._subs = remove(subscriber, this._subs)
    }
  }
}

export class MergedThunk {
  _subs: Subscriber<MergedThunk>[] = []

  results: PublishResultsByRelay = {}

  constructor(readonly thunks: Thunk[]) {
    const {Aborted, Failure, Timeout, Pending, Sending, Success} = PublishStatus
    const relays = new Set(thunks.flatMap(thunk => thunk.options.relays))

    for (const thunk of thunks) {
      thunk.subscribe($thunk => {
        this.results = {}

        for (const relay of relays) {
          for (const status of [Aborted, Failure, Timeout, Pending, Sending, Success]) {
            const thunk = thunks.find(t => t.results[relay]?.status === status)

            if (thunk) {
              this.results[relay] = thunk.results[relay]!
            }
          }
        }

        this._notify()

        if (thunks.every(thunkIsComplete)) {
          this._subs = []
        }
      })
    }
  }

  _notify() {
    for (const subscriber of this._subs) {
      subscriber(this)
    }
  }

  subscribe(subscriber: Subscriber<MergedThunk>) {
    this._subs.push(subscriber)

    subscriber(this)

    return () => {
      this._subs = remove(subscriber, this._subs)
    }
  }
}

export type AbstractThunk = Thunk | MergedThunk

export const isThunk = (thunk: AbstractThunk): thunk is Thunk => thunk instanceof Thunk

export const isMergedThunk = (thunk: AbstractThunk): thunk is MergedThunk =>
  thunk instanceof MergedThunk

// Thunk status urls

export const getThunkUrlsWithStatus = (
  statuses: PublishStatus | PublishStatus[],
  thunk: AbstractThunk,
) => {
  statuses = ensurePlural(statuses)

  return Object.entries(thunk.results)
    .filter(([_, {status}]) => statuses.includes(status))
    .map(nth(0)) as string[]
}

export const getCompleteThunkUrls = (thunk: AbstractThunk) =>
  getThunkUrlsWithStatus(
    without([PublishStatus.Sending, PublishStatus.Pending], Object.values(PublishStatus)),
    thunk,
  )

export const getIncompleteThunkUrls = (thunk: AbstractThunk) =>
  getThunkUrlsWithStatus([PublishStatus.Sending, PublishStatus.Pending], thunk)

export const getFailedThunkUrls = (thunk: AbstractThunk) =>
  getThunkUrlsWithStatus([PublishStatus.Failure, PublishStatus.Timeout], thunk)

// Thunk status checks

export const thunkHasStatus = (statuses: PublishStatus | PublishStatus[], thunk: AbstractThunk) =>
  getThunkUrlsWithStatus(statuses, thunk).length > 0

export const thunkIsComplete = (thunk: AbstractThunk) =>
  !thunkHasStatus([PublishStatus.Sending, PublishStatus.Pending], thunk)

// Thunk errors

export const getThunkError = (thunk: Thunk) => {
  for (const [_, {status, detail}] of Object.entries(thunk.results)) {
    if (status === PublishStatus.Failure) {
      return detail
    }
  }

  if (thunkIsComplete(thunk)) {
    return ""
  }
}

// Thunk utilities that return promises

export const waitForThunkError = (thunk: Thunk) =>
  new Promise<string>(resolve => {
    thunk.subscribe($thunk => {
      const error = getThunkError($thunk)

      if (error !== undefined) {
        resolve(error)
      }
    })
  })

export const waitForThunkCompletion = (thunk: Thunk) =>
  new Promise<void>(resolve => {
    thunk.subscribe($thunk => {
      if (thunkIsComplete($thunk)) {
        resolve()
      }
    })
  })

// Thunk state

export const thunks = writable<Thunk[]>([])

export const thunkQueue = new TaskQueue<Thunk>({
  batchSize: 50,
  processItem: (thunk: Thunk) => {
    thunk.publish()
  },
})

// Other thunk utilities

export const mergeThunks = (thunks: AbstractThunk[]) =>
  new MergedThunk(Array.from(flattenThunks(thunks)))

export function* flattenThunks(thunks: AbstractThunk[]): Iterable<Thunk> {
  for (const thunk of thunks) {
    if (isMergedThunk(thunk)) {
      yield* flattenThunks(thunk.thunks)
    } else {
      yield thunk
    }
  }
}

export const publishThunk = (options: ThunkOptions) => {
  const thunk = new Thunk(options)

  thunk.enqueue()

  return thunk
}

export const abortThunk = (thunk: AbstractThunk) => {
  for (const child of flattenThunks([thunk])) {
    child.controller.abort()
  }
}

export const retryThunk = (thunk: AbstractThunk) =>
  isMergedThunk(thunk)
    ? mergeThunks(thunk.thunks.map(t => publishThunk(t.options)))
    : publishThunk(thunk.options)
