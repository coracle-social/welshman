import {ROOMS, normalizeRelayUrl} from "@welshman/util"
import {RoomList, RoomListReader, RoomListWriter} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 kind-10009 room lists (relays the user belongs to, and the rooms on
 * them), keyed by pubkey. Loaded via the outbox model (the author's write
 * relays), so it depends on the relay-list collection.
 */
export class RoomLists extends DerivedPlugin<RoomListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [ROOMS]}],
      eventToItem: app.use(Domain).reader(RoomList),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [ROOMS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  roomsForUrl = (pubkey: string, url: string): Projection<string[]> =>
    this.project(pubkey, list => list?.roomsForUrl(url) ?? [])

  pubkeysForUrl = (url: string): Projection<string[]> =>
    projectFrom(this.all, lists =>
      lists.filter(list => list.urls().includes(normalizeRelayUrl(url))).map(list => list.author()),
    )

  update = async (fn: (writer: RoomListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(RoomList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  addRoom = (roomId: string, url: string) => this.update(writer => writer.addRoom(roomId, url))

  removeRoom = (roomId: string, url?: string) =>
    this.update(writer => writer.removeRoom(roomId, url))

  addRelay = (url: string) => this.update(writer => writer.addRelay(url))

  removeRelay = (url: string) => this.update(writer => writer.removeRelay(url))
}
