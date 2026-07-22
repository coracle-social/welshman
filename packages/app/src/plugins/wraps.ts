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
  queue: TaskQueue<TrustedEvent>

  constructor(readonly app: IApp) {
    this.queue = new TaskQueue<TrustedEvent>({
      batchSize: 50,
      batchDelay: 30,
      processItem: async (wrap: TrustedEvent) => {
        const signer = this.app.user?.signer
        const recipient = this.app.user?.pubkey

        // Only unwrap messages addressed to our user
        if (!signer || !recipient || !tagValues(hexTags("p"), wrap.tags).includes(recipient)) {
          return
        }

        try {
          const rumor = await Nip59.fromSigner(signer).unwrap(wrap as SignedEvent)

          this.app.wrapManager.add({wrap: wrap as SignedEvent, rumor, recipient})
        } catch (e) {
          this.failedUnwraps.add(wrap.id)
        }
      },
    })
  }

  enqueue = (wrap: TrustedEvent) => {
    if (this.failedUnwraps.has(wrap.id)) return
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
