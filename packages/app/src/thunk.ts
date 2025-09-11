import type {Subscriber} from "svelte/store"
import {writable, get} from "svelte/store"
import {
  TaskQueue,
  ifLet,
  ensurePlural,
  dissoc,
  remove,
  defer,
  sleep,
  assoc,
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
import {publish, PublishStatus, PublishOptions, PublishStatusByRelay} from "@welshman/net"
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
  result = defer<PublishStatusByRelay>()
  status: PublishStatusByRelay = {}
  details: Record<string, string> = {}
  controller = new AbortController()

  constructor(readonly options: ThunkOptions) {
    this.event = prepEvent(options.event)

    for (const relay of options.relays) {
      this.status[relay] = PublishStatus.Sending
    }

    this.controller.signal.addEventListener("abort", () => {
      for (const relay of options.relays) {
        this._setAborted(relay)
      }
    })
  }

  _notify() {
    for (const subscriber of this._subs) {
      subscriber(this)
    }
  }

  _fail(message: string) {
    for (const relay of this.options.relays) {
      this.status[relay] = PublishStatus.Failure
      this.details[relay] = message
    }

    this._notify()
  }

  _setPending(relay: string) {
    this.options.onPending?.(relay)
    this.status[relay] = PublishStatus.Pending
    this._notify()
  }

  _setTimeout(relay: string) {
    this.options.onTimeout?.(relay)
    this.status[relay] = PublishStatus.Timeout
    this.details[relay] = "Publish timed out"
    this._notify()
  }

  _setAborted(relay: string) {
    this.options.onAborted?.(relay)
    this.status[relay] = PublishStatus.Aborted
    this.details[relay] = "Publish was aborted"
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
        event = await signer.sign(event)
      } catch (e: any) {
        return this._fail(`Failed to sign event: ${String(e.error || e)}`)
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
    this.result.resolve(
      await publish({
        ...this.options,
        event: signedEvent,
        onSuccess: (message: string, relay: string) => {
          tracker.track(signedEvent.id, relay)
          this.options.onSuccess?.(message, relay)
          this.status[relay] = PublishStatus.Success
          this.details[relay] = message
          this._notify()
        },
        onFailure: (message: string, relay: string) => {
          this.options.onFailure?.(message, relay)
          this.status[relay] = PublishStatus.Failure
          this.details[relay] = message
          this._notify()
        },
        onPending: (relay: string) => {
          this._setPending(relay)
        },
        onTimeout: (relay: string) => {
          this._setTimeout(relay)
        },
        onAborted: (relay: string) => {
          this._setAborted(relay)
        },
        onComplete: () => {
          this.options.onComplete?.()
          this._subs = []
        },
      }),
    )
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

  status: PublishStatusByRelay = {}
  details: Record<string, string> = {}

  constructor(readonly thunks: Thunk[]) {
    const {Aborted, Failure, Timeout, Pending, Sending, Success} = PublishStatus
    const relays = new Set(thunks.flatMap(thunk => thunk.options.relays))

    for (const thunk of thunks) {
      thunk.subscribe($thunk => {
        this.status = {}
        this.details = {}

        for (const relay of relays) {
          for (const status of [Aborted, Failure, Timeout, Pending, Sending, Success]) {
            const thunk = thunks.find(t => t.status[relay] === status)

            if (thunk) {
              this.status[relay] = thunk.status[relay]!
              this.details[relay] = thunk.details[relay]!
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

  return Object.entries(thunk.status)
    .filter(([_, status]) => statuses.includes(status))
    .map(nth(0))
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
  for (const [relay, status] of Object.entries(thunk.status)) {
    if (status === PublishStatus.Failure) {
      return thunk.details[relay]
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

export const thunks = writable<Record<string, AbstractThunk>>({})

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

  thunks.update(assoc(thunk.event.id, thunk))

  return thunk
}

export const abortThunk = (thunk: AbstractThunk) => {
  for (const child of flattenThunks([thunk])) {
    child.controller.abort()
    thunks.update(dissoc(child.event.id))
    repository.removeEvent(child.event.id)
  }
}

export const retryThunk = (thunk: AbstractThunk) =>
  isMergedThunk(thunk)
    ? mergeThunks(thunk.thunks.map(t => publishThunk(t.options)))
    : publishThunk(thunk.options)
