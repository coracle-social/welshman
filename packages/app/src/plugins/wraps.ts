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

/**
 * Per-app wrap (NIP-59) state: the unwrap queue plus failure/dedup
 * tracking. Scoped to `app.user`, so an app only ever unwraps its own user's
 * messages into its own repository — which is what keeps DM history from being
 * merged across identities. The repository subscription that feeds it lives in
 * `appPolicyWraps`.
 */
export class Wraps {
  failedUnwraps = new Set<string>()
  queue?: TaskQueue<TrustedEvent>

  constructor(readonly app: IApp) {
    if (app.user) {
      const {pubkey, signer} = app.user
      const nip59 = Nip59.fromSigner(signer)

      this.queue = new TaskQueue<TrustedEvent>({
        batchSize: 50,
        batchDelay: 30,
        processItem: async (wrap: TrustedEvent) => {
          // Cleanup drops the queue, but a batch already in flight keeps going,
          // so check on both sides of the decrypt rather than unwrapping into a
          // repository that's been cleared out from under us
          if (!this.queue) return
          if (!tagValues(hexTags("p"), wrap.tags).includes(pubkey)) return

          try {
            const rumor = await nip59.unwrap(wrap as SignedEvent)

            if (this.queue) {
              this.app.wrapManager.add({wrap: wrap as SignedEvent, rumor, recipient: pubkey})
            }
          } catch (e) {
            this.failedUnwraps.add(wrap.id)
          }
        },
      })
    }

    app.onCleanup(() => {
      this.queue?.clear()
      this.queue = undefined
    })
  }

  enqueue = (wrap: TrustedEvent) => {
    if (this.failedUnwraps.has(wrap.id)) return
    if (this.app.wrapManager.getRumor(wrap.id)) return

    this.queue?.push(wrap)
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
