import {ROOMS, normalizeRelayUrl} from "@welshman/util"
import {RoomList, RoomListReader, RoomListBuilder} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 kind-10009 room lists (relays the user belongs to, and groups on
 * them), keyed by pubkey. Loaded via the outbox model (the author's write
 * relays), so it depends on the relay-list collection.
 */
export class RoomLists extends DerivedPlugin<RoomListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [ROOMS]}],
      eventToItem: RoomList.factory(app.user?.signer),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [ROOMS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  groupsForUrl = (pubkey: string, url: string): Projection<string[]> =>
    this.project(pubkey, list => list?.groupsForUrl(url) ?? [])

  pubkeysForUrl = (url: string): Projection<string[]> =>
    projectFrom(this.all, lists =>
      lists.filter(list => list.urls().includes(normalizeRelayUrl(url))).map(list => list.author()),
    )

  update = async (fn: (builder: RoomListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = RoomList.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }
}
