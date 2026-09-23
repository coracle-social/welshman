import {TaskQueue, uniq, now} from "@welshman/lib"
import {hexTags, tagValues, prep} from "@welshman/util"
import type {TrustedEvent, SignedEvent, EventTemplate} from "@welshman/util"
import {Nip59} from "@welshman/signer"
import {MergedThunk, Thunks} from "./thunk.js"
import type {ThunkOptions} from "./thunk.js"
import {User} from "../user.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import type {IApp} from "../app.js"

export type SendWrappedOptions = Omit<
  ThunkOptions,
  "event" | "relays" | "recipient" | "app" | "user"
> & {
  event: EventTemplate
  recipients: string[]
}

export const MAX_UNWRAP_ATTEMPTS = 3

/**
 * Per-app wrap (NIP-59) state: the unwrap queue plus attempt/dedup
 * tracking. Scoped to `app.user`, so an app only ever unwraps its own user's
 * messages into its own repository — which is what keeps DM history from being
 * merged across identities. The repository subscription that feeds it lives in
 * `appPolicyWraps`.
 *
 * A wrap whose unwrap throws goes back on the queue until it has been tried
 * `MAX_UNWRAP_ATTEMPTS` times, since a signer that is busy or disconnected
 * fails the same way a wrap this user cannot read does.
 */
export class Wraps {
  unwrapAttempts = new Map<string, number>()
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
          const rumor = await nip59.unwrap(wrap as SignedEvent)

          this.app.wrapManager.add({
            wrap: wrap as SignedEvent,
            rumor,
            recipient: app.user.pubkey,
          })
        } catch (e) {
          const attempts = (this.unwrapAttempts.get(wrap.id) ?? 0) + 1

          this.unwrapAttempts.set(wrap.id, attempts)

          if (attempts < MAX_UNWRAP_ATTEMPTS) {
            this.queue.push(wrap)
          }
        }
      },
    })

    app.onCleanup(() => {
      this.queue.clear()
    })
  }

  enqueue = (wrap: TrustedEvent) => {
    if ((this.unwrapAttempts.get(wrap.id) ?? 0) >= MAX_UNWRAP_ATTEMPTS) return
    if (this.app.wrapManager.getRumor(wrap.id)) return

    this.queue.push(wrap)
  }

  // NIP-59: wrap an event for each recipient (using their messaging relays) and
  // publish the wraps as the app's user.
  publish = async ({event, recipients, ...options}: SendWrappedOptions) => {
    const user = User.require(this.app)

    // Stabilize the event id across the different wraps
    const stableEvent = prep(event, user.pubkey, now())

    return new MergedThunk(
      await Promise.all(
        uniq(recipients).map(async recipient => {
          const relays = (await this.app.use(MessagingRelayLists).load(recipient))?.urls() ?? []

          return this.app.use(Thunks).publish({event: stableEvent, relays, recipient, ...options})
        }),
      ),
    )
  }
}
