import type {Subscriber} from "svelte/store"
import {get, writable} from "svelte/store"
import type {Override} from "@welshman/lib"
import {append, TaskQueue, ensurePlural, remove, defer, sleep, nth, without} from "@welshman/lib"
import {
  HashedEvent,
  EventTemplate,
  SignedEvent,
  isSignedEvent,
  WRAPPED_KINDS,
  prep,
  makePow,
} from "@welshman/util"
import {PublishStatus, PublishResult, PublishOptions, PublishResultsByRelay} from "@welshman/net"
import {Nip01Signer, Nip59} from "@welshman/signer"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {User} from "../user.js"

export type ThunkOptions = Override<
  PublishOptions,
  {
    app: IApp
    event: EventTemplate
    recipient?: string
    delay?: number
    pow?: number
  }
>

/**
 * Shared base for `Thunk` and `MergedThunk`: a subscribable bag of per-relay
 * publish `results`.
 */
export abstract class BaseThunk {
  _subs: Subscriber<any>[] = []
  results: PublishResultsByRelay = {}

  abstract abort(): void

  _notify() {
    for (const subscriber of this._subs) {
      subscriber(this)
    }
  }

  subscribe(subscriber: Subscriber<this>) {
    this._subs.push(subscriber)

    subscriber(this)

    return () => {
      this._subs = remove(subscriber, this._subs)
    }
  }

  getUrlsWithStatus(statuses: PublishStatus | PublishStatus[]) {
    const matches = ensurePlural(statuses)

    return Object.entries(this.results)
      .filter(([_, {status}]) => matches.includes(status))
      .map(nth(0)) as string[]
  }

  getCompleteUrls() {
    return this.getUrlsWithStatus(
      without([PublishStatus.Sending, PublishStatus.Pending], Object.values(PublishStatus)),
    )
  }

  getIncompleteUrls() {
    return this.getUrlsWithStatus([PublishStatus.Sending, PublishStatus.Pending])
  }

  getFailedUrls() {
    return this.getUrlsWithStatus([PublishStatus.Failure, PublishStatus.Timeout])
  }

  hasStatus(statuses: PublishStatus | PublishStatus[]) {
    return this.getUrlsWithStatus(statuses).length > 0
  }

  isComplete() {
    return !this.hasStatus([PublishStatus.Sending, PublishStatus.Pending])
  }

  getError() {
    for (const [_, {status, detail}] of Object.entries(this.results)) {
      if (status === PublishStatus.Failure) {
        return detail
      }
    }

    if (this.isComplete()) {
      return ""
    }
  }

  waitForError() {
    return new Promise<string>(resolve => {
      this.subscribe(thunk => {
        const error = thunk.getError()

        if (error !== undefined) {
          resolve(error)
        }
      })
    })
  }

  waitForCompletion() {
    return new Promise<void>(resolve => {
      this.subscribe(thunk => {
        if (thunk.isComplete()) {
          resolve()
        }
      })
    })
  }
}

export class Thunk extends BaseThunk {
  event: HashedEvent
  complete = defer<void>()
  controller = new AbortController()
  wrap?: SignedEvent

  constructor(readonly options: ThunkOptions) {
    super()

    if (!options.recipient && WRAPPED_KINDS.includes(options.event.kind)) {
      throw new Error(`Attempted to publish a kind ${options.event.kind} without wrapping it`)
    }

    this.event = prep(options.event, this.user.pubkey)

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

  get user() {
    return User.require(this.options.app)
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
    await this.options.app.use(Network).publish({
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
          this.options.app.tracker.removeRelay(event.id, result.relay)
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
      const wrapper = Nip01Signer.ephemeral()
      const nip59 = new Nip59(this.user.signer, wrapper)

      this.wrap = await nip59.wrap(recipient, this.event)

      // If we're calculating pow, update the hash and re-sign
      if (this.options.pow) {
        this.wrap = await wrapper.sign(await makePow(this.wrap, this.options.pow).result, {
          signal: AbortSignal.timeout(30_000),
        })
      }

      this.options.app.wrapManager.add({recipient, wrap: this.wrap, rumor: this.event})

      return this._publish(this.wrap)
    }

    // If the event has been signed, we're good to go
    if (isSignedEvent(this.event)) {
      if (this.options.pow) {
        console.warn("Event is already signed, skipping proof of work calculation")
      }

      return this._publish(this.event)
    }

    // Allow for lazily signing/powing events in order to decrease apparent latency in the UI
    // that results from waiting for remote signers
    try {
      const unsignedId = this.event.id

      if (this.options.pow) {
        this.event = await makePow(this.event, this.options.pow).result
      }

      const signedEvent = await this.user.signer.sign(this.event, {
        signal: AbortSignal.timeout(30_000),
      })

      // Signing is slow enough to be aborted mid-flight; bail before writing the
      // signed event, since the abort handler has already unwound the unsigned one
      if (this.controller.signal.aborted) {
        return
      }

      // Update tracker and repository with the signed event since the id will have changed
      if (this.options.pow) {
        for (const url of this.options.relays) {
          this.options.app.tracker.removeRelay(unsignedId, url)
          this.options.app.tracker.track(signedEvent.id, url)
        }
      }

      this.options.app.repository.removeEvent(unsignedId)
      this.options.app.repository.publish(signedEvent)

      return this._publish(signedEvent)
    } catch (e: any) {
      console.error("Failed to sign event", e)
      return this._fail(String(e || "Failed to sign event"))
    }
  }

  abort() {
    this.controller.abort()
  }
}

export class MergedThunk extends BaseThunk {
  constructor(readonly thunks: Thunk[]) {
    super()

    const {Aborted, Failure, Timeout, Pending, Sending, Success} = PublishStatus
    const relays = new Set(thunks.flatMap(thunk => thunk.options.relays))

    for (const thunk of thunks) {
      thunk.subscribe(() => {
        this.results = {}

        for (const relay of relays) {
          for (const status of [Aborted, Failure, Timeout, Pending, Sending, Success]) {
            const match = thunks.find(t => t.results[relay]?.status === status)

            if (match) {
              this.results[relay] = match.results[relay]!
            }
          }
        }

        this._notify()

        if (thunks.every(t => t.isComplete())) {
          this._subs = []
        }
      })
    }
  }

  abort() {
    this.thunks.forEach(thunk => thunk.abort())
  }
}

/**
 * Per-app thunk manager — the publish-side counterpart of `Network`. Owns
 * the app's optimistic-publish `history` store and the `queue` that paces
 * publishing. Reach it via `app.use(Thunks)`; `publish` fills in the app
 * (the acting user is derived from it), enqueues the thunk (optimistically
 * writing it to the repository), and returns it.
 */
export class Thunks {
  history = writable<Thunk[]>([])

  queue = new TaskQueue<Thunk>({
    batchSize: 10,
    batchDelay: 100,
    processItem: (thunk: Thunk) => {
      thunk.publish()
    },
  })

  constructor(readonly app: IApp) {
    app.onCleanup(() => {
      this.queue.clear()

      // Anything still in flight would go on publishing after teardown, opening
      // sockets in the cleared pool and writing its event back into the cleared
      // repository. Aborting also unwinds each thunk's optimistic write.
      for (const thunk of get(this.history)) {
        if (!thunk.isComplete()) {
          thunk.abort()
        }
      }
    })
  }

  enqueue(thunk: Thunk) {
    this.queue.push(thunk)

    for (const url of thunk.options.relays) {
      this.app.tracker.track(thunk.event.id, url)
    }

    this.app.repository.publish(thunk.event)
    this.history.update($history => append(thunk, $history))

    thunk.controller.signal.addEventListener("abort", () => {
      // wrapManager.remove may not have registered the wrap yet if abort races it.
      if (thunk.wrap) {
        this.app.wrapManager.remove(thunk.wrap.id)
      }

      this.app.repository.removeEvent(thunk.event.id)

      this.history.update($history => remove(thunk, $history))
    })
  }

  publish = (options: Omit<ThunkOptions, "app">) => {
    const thunk = new Thunk({...options, app: this.app})

    this.enqueue(thunk)

    return thunk
  }

  retry = (thunk: BaseThunk) =>
    thunk instanceof MergedThunk
      ? new MergedThunk(thunk.thunks.map(t => this.publish(t.options)))
      : this.publish((thunk as Thunk).options)

  merge(thunks: BaseThunk[]) {
    return new MergedThunk(Array.from(this.flatten(thunks)))
  }

  *flatten(thunks: BaseThunk[]): Iterable<Thunk> {
    for (const thunk of thunks) {
      if (thunk instanceof MergedThunk) {
        yield* this.flatten(thunk.thunks)
      } else if (thunk instanceof Thunk) {
        yield thunk
      }
    }
  }
}
