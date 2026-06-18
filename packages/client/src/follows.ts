import {
  FOLLOWS,
  asDecryptedEvent,
  readList,
  makeList,
  addToListPublicly,
  removeFromList,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {DerivedData} from "./clientData.js"
import {Network} from "./network.js"
import {Thunks} from "./thunk.js"
import {User} from "./user.js"
import type {IClient} from "./client.js"

/**
 * Kind-3 follow lists, keyed by pubkey. Loaded via the outbox model (the
 * author's write relays), so it depends on the relay-list collection.
 */
export class FollowLists extends DerivedData<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [FOLLOWS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: followList => followList.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(Network).loadUsingOutbox(pubkey, {kinds: [FOLLOWS]}, relayHints)
  }

  follow = async (tag: string[]) => {
    const user = User.require(this.ctx)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: FOLLOWS})
    const event = await addToListPublicly(list, tag).reconcile(user.nip44EncryptToSelf)

    return this.ctx.use(Thunks).publishToOutbox({event})
  }

  unfollow = async (value: string) => {
    const user = User.require(this.ctx)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: FOLLOWS})
    const event = await removeFromList(list, value).reconcile(user.nip44EncryptToSelf)

    return this.ctx.use(Thunks).publishToOutbox({event})
  }
}
