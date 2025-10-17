import type {Subscriber} from "svelte/store"
import {writable, get} from "svelte/store"
import {
  append,
  reject,
  spec,
  TaskQueue,
  ifLet,
  ensurePlural,
  remove,
  defer,
  sleep,
  nth,
  without,
} from "@welshman/lib"
import {stamp, own, hash} from "@welshman/signer"
import {
  TrustedEvent,
  HashedEvent,
  EventTemplate,
  SignedEvent,
  StampedEvent,
  OwnedEvent,
  isStampedEvent,
  isOwnedEvent,
  isHashedEvent,
  isUnwrappedEvent,
  isSignedEvent,
} from "@welshman/util"
import {
  publish,
  PublishStatus,
  PublishResult,
  PublishOptions,
  PublishResultsByRelay,
} from "@welshman/net"
import {repository, tracker} from "./core.js"
import {pubkey, getSession, getSigner} from "./session.js"

export type ThunkEvent = EventTemplate | StampedEvent | OwnedEvent | TrustedEvent

export const prepEvent = (event: ThunkEvent) => {
  if (!isStampedEvent(event as StampedEvent)) {
    event = stamp(event)
  }

  if (!isOwnedEvent(event as OwnedEvent)) {
    event = own(event as StampedEvent, get(pubkey)!)
  }

  if (!isHashedEvent(event as HashedEvent)) {
    event = hash(event as OwnedEvent)
  }

  return event as TrustedEvent
}

export type ThunkOptions = Omit<PublishOptions, "event"> & {
  event: ThunkEvent
  delay?: number
}

export class Thunk {
  _subs: Subscriber<Thunk>[] = []

  event: TrustedEvent
  results: PublishResultsByRelay = {}
  complete = defer<void>()
  controller = new AbortController()

  constructor(readonly options: ThunkOptions) {
    this.event = prepEvent(options.event)

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

  async publish() {
    let event = this.event

    // Handle abort immediately if possible
    if (this.controller.signal.aborted) return

    // If we were given a wrapped event, make sure to publish the wrapper, not the rumor
    if (isUnwrappedEvent(event)) {
      event = event.wrap
    }

    // If the event was already signed, leave it alone. Otherwise, sign it now. This is to
    // decrease apparent latency in the UI that results from waiting for remote signers
    if (!isSignedEvent(event)) {
      const signer = getSigner(getSession(event.pubkey))

      if (!signer) {
        return this._fail(`No signer found for ${event.pubkey}`)
      }

      try {
        event = await signer.sign(event, {
          signal: AbortSignal.timeout(15_000),
        })
      } catch (e: any) {
        return this._fail(String(e || "Failed to sign event"))
      }
    }

    // We're guaranteed to have a signed event at this point
    const signedEvent = event as SignedEvent

    // Copy the signature over since we had deferred signing
    ifLet(repository.getEvent(signedEvent.id), savedEvent => {
      savedEvent.sig = signedEvent.sig
    })

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
      event: signedEvent,
      onSuccess: (result: PublishResult) => {
        tracker.track(signedEvent.id, result.relay)
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
        this.options.onComplete?.(result)
        this._subs = []
      },
    })

    this.complete.resolve()
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

  thunkQueue.push(thunk)

  repository.publish(thunk.event)

  thunks.update($thunks => append(thunk, $thunks))

  return thunk
}

export const abortThunk = (thunk: AbstractThunk) => {
  for (const child of flattenThunks([thunk])) {
    child.controller.abort()
    repository.removeEvent(child.event.id)
    thunks.update($thunks => reject(spec({id: child.event.id}), $thunks))
  }
}

export const retryThunk = (thunk: AbstractThunk) =>
  isMergedThunk(thunk)
    ? mergeThunks(thunk.thunks.map(t => publishThunk(t.options)))
    : publishThunk(thunk.options)
