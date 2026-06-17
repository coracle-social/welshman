import {
  BLOCKED_RELAYS,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  makeList,
  makeEvent,
  addToListPublicly,
  removeFromList,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Collection} from "./collection.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "./user.js"
import {Thunks} from "./thunk.js"
import type {IClient} from "./client.js"

/**
 * Kind-10006 blocked-relay lists, keyed by pubkey. Loaded via the outbox model,
 * so it depends on the relay-list collection. Feeds `RelayStats.getQuality` so
 * blocked relays are never selected.
 */
export class BlockedRelayLists extends Collection<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [BLOCKED_RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: list => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(Network).loadUsingOutbox(pubkey, {kinds: [BLOCKED_RELAYS]}, relayHints)
  }

  getBlockedRelays = (pubkey: string) => getRelaysFromList(this.get(pubkey))

  addRelay = async (url: string) => {
    const user = User.require(this.ctx)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: BLOCKED_RELAYS})
    const event = await addToListPublicly(list, ["relay", url]).reconcile(user.nip44EncryptToSelf)

    return this.ctx.use(Thunks).publishToOutbox({event})
  }

  removeRelay = async (url: string) => {
    const user = User.require(this.ctx)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: BLOCKED_RELAYS})
    const event = await removeFromList(list, url).reconcile(user.nip44EncryptToSelf)

    return this.ctx.use(Thunks).publishToOutbox({event})
  }

  setRelays = (urls: string[]) =>
    this.ctx.use(Thunks).publish({
      event: makeEvent(BLOCKED_RELAYS, {tags: urls.map(url => ["relay", url])}),
      relays: this.ctx.use(Router).FromUser().getUrls(),
    })
}
