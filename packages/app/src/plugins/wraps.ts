import {TaskQueue, uniq, now} from "@welshman/lib"
import {hexTags, tagValues, prep} from "@welshman/util"
import type {TrustedEvent, SignedEvent, EventTemplate} from "@welshman/util"
import {Nip59} from "@welshman/signer"
import {PublicationGroup, Publisher} from "./publisher.js"
import type {PublishRequest} from "./publisher.js"
import {User} from "../user.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import type {IApp} from "../app.js"

export type SendWrappedOptions = Omit<PublishRequest, "event" | "relays" | "recipient"> & {
  event: EventTemplate
  recipients: string[]
}

export const MAX_UNWRAP_ATTEMPTS = 3

// Doubled for each attempt, so a busy or disconnected signer has time to come back
export const UNWRAP_RETRY_DELAY = 5_000

/**
 * Per-app wrap (NIP-59) state: the unwrap queue plus attempt/dedup
 * tracking. Scoped to `app.user`, so an app only ever unwraps its own user's
 * messages into its own repository — which is what keeps DM history from being
 * merged across identities. The repository subscription that feeds it lives in
 * `appPolicyWraps`.
 *
 * A wrap whose unwrap throws or times out goes back on the queue after a backoff until it has
 * been tried `MAX_UNWRAP_ATTEMPTS` times, since a signer that is busy or disconnected fails
 * the same way a wrap this user cannot read does.
 *
 * Unwrapping a stored backlog is work behind whatever the user is doing, so each decryption
 * asks for the back of the signer's queue and the signer bounds it by `SIGNER_TIMEOUT`. The
 * queue waits out a slow signer rather than abandoning a decryption that is still running,
 * which is what used to leave orphaned requests in front of every later wrap.
 */
export class Wraps {
  unwrapAttempts = new Map<string, number>()
  retryTimers = new Set<ReturnType<typeof setTimeout>>()
  queue: TaskQueue<TrustedEvent>

  constructor(readonly app: IApp) {
    this.queue = new TaskQueue<TrustedEvent>({
      batchSize: 50,
      batchDelay: 30,
      processItem: async (wrap: TrustedEvent) => {
        if (!app.user) return
        if (!tagValues(hexTags("p"), wrap.tags).includes(app.user.pubkey)) return

        try {
          const nip59 = Nip59.fromSigner(app.user.signer)
          const rumor = await nip59.unwrap(wrap as SignedEvent, {priority: -1})

          this.app.wrapManager.add({
            wrap: wrap as SignedEvent,
            rumor,
            recipient: app.user.pubkey,
          })
        } catch (e) {
          const attempts = (this.unwrapAttempts.get(wrap.id) ?? 0) + 1

          this.unwrapAttempts.set(wrap.id, attempts)

          if (attempts < MAX_UNWRAP_ATTEMPTS) {
            this.retry(wrap, UNWRAP_RETRY_DELAY * 2 ** (attempts - 1))
          }
        }
      },
    })

    app.onCleanup(() => {
      this.queue.clear()

      for (const timer of this.retryTimers) {
        clearTimeout(timer)
      }

      this.retryTimers.clear()
    })
  }

  retry = (wrap: TrustedEvent, delay: number) => {
    const timer = setTimeout(() => {
      this.retryTimers.delete(timer)
      this.queue.push(wrap)
    }, delay)

    this.retryTimers.add(timer)
  }

  enqueue = (wrap: TrustedEvent) => {
    // A wrap that failed is either waiting on a retry or has been given up on
    if (this.unwrapAttempts.has(wrap.id)) return
    if (this.app.wrapManager.getRumor(wrap.id)) return

    this.queue.push(wrap)
  }

  // NIP-59: wrap an event for each recipient (using their messaging relays) and
  // publish the wraps as the app's user.
  publish = async ({event, recipients, ...options}: SendWrappedOptions) => {
    const user = User.require(this.app)

    // Stabilize the event id across the different wraps
    const stableEvent = prep(event, user.pubkey, now())

    return new PublicationGroup(
      await Promise.all(
        uniq(recipients).map(async recipient => {
          const relays = (await this.app.use(MessagingRelayLists).load(recipient))?.urls() ?? []

          return this.app
            .use(Publisher)
            .publish({event: stableEvent, relays, recipient, ...options})
        }),
      ),
    )
  }
}
