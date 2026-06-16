import {get, writable} from "svelte/store"
import {TaskQueue, uniq, now} from "@welshman/lib"
import {getPubkeyTagValues, getRelaysFromList, prep} from "@welshman/util"
import type {TrustedEvent, SignedEvent, EventTemplate} from "@welshman/util"
import {Nip59} from "@welshman/signer"
import {MergedThunk, Thunks} from "./thunk.js"
import type {ThunkOptions} from "./thunk.js"
import {User} from "./user.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import type {IClient} from "./client.js"

export type SendWrappedOptions = Omit<
  ThunkOptions,
  "event" | "relays" | "recipient" | "client" | "user"
> & {
  event: EventTemplate
  recipients: string[]
}

/**
 * Per-client gift-wrap (NIP-59) state: the unwrap queue plus failure/dedup
 * tracking. Scoped to `ctx.user`, so a client only ever unwraps its own user's
 * messages into its own repository — which is what keeps DM history from being
 * merged across identities. The repository subscription that feeds it lives in
 * `clientPolicyGiftWraps`.
 */
export class GiftWraps {
  failedUnwraps = new Set<string>()
  queue: TaskQueue<TrustedEvent>

  constructor(readonly ctx: IClient) {
    this.queue = new TaskQueue<TrustedEvent>({
      batchSize: 50,
      batchDelay: 30,
      processItem: async (wrap: TrustedEvent) => {
        const signer = this.ctx.user?.signer
        const recipient = this.ctx.user?.pubkey

        // Only unwrap messages addressed to our user
        if (!signer || !recipient || !getPubkeyTagValues(wrap.tags).includes(recipient)) {
          return
        }

        try {
          const rumor = await Nip59.fromSigner(signer).unwrap(wrap as SignedEvent)

          this.ctx.wrapManager.add({wrap: wrap as SignedEvent, rumor, recipient})
        } catch (e) {
          this.failedUnwraps.add(wrap.id)
        }
      },
    })
  }

  enqueue = (wrap: TrustedEvent) => {
    if (this.failedUnwraps.has(wrap.id)) return
    if (this.ctx.wrapManager.getRumor(wrap.id)) return

    this.queue.push(wrap)
  }

  // NIP-59: wrap an event for each recipient (using their messaging relays) and
  // publish the wraps as the client's user.
  publish = async ({event, recipients, ...options}: SendWrappedOptions) => {
    const user = User.require(this.ctx)

    // Stabilize the event id across the different wraps
    const stableEvent = prep(event, user.pubkey, now())

    return new MergedThunk(
      await Promise.all(
        uniq(recipients).map(async recipient => {
          const relays = getRelaysFromList(await this.ctx.use(MessagingRelayLists).load(recipient))

          return this.ctx.use(Thunks).publish({event: stableEvent, relays, recipient, ...options})
        }),
      ),
    )
  }
}
