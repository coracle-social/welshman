import type {Maybe} from "@welshman/lib"
import {ROOMS, normalizeRelayUrl} from "@welshman/util"
import {RoomList, RoomListReader, RoomListWriter} from "@welshman/domain"
import type {Command} from "../command.js"
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

  setRelays = (urls: string[]) => this.update(writer => writer.setRelays(urls))

  // Point every reference to a relay at its new url. Resolves to undefined when there's
  // nothing to do, so a no-op migration doesn't publish.
  migrateRelay = async (oldUrl: string, newUrl: string): Promise<Maybe<Command>> => {
    const from = normalizeRelayUrl(oldUrl)
    const to = normalizeRelayUrl(newUrl)

    if (from === to) return undefined

    const user = User.require(this.app)

    if (!this.get(user.pubkey)?.urls().includes(from)) return undefined

    return this.update(writer => writer.migrateRelay(from, to))
  }
}
