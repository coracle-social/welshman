import {uniq} from "@welshman/lib"
import {ROOMS, getRelayTagValues, normalizeRelayUrl} from "@welshman/util"
import {RoomList, RoomListBuilder} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 kind-10009 room lists (relays the user belongs to, and groups on
 * them), keyed by pubkey. Loaded via the outbox model (the author's write
 * relays), so it depends on the relay-list collection.
 */
export class RoomLists extends DerivedPlugin<RoomList> {
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

  update = async (fn: (builder: RoomListBuilder) => void, extraRelays: string[] = []) => {
    const user = User.require(this.app)
    const builder = new RoomListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)

    // Include every listed relay, in addition to the outbox set, so each one
    // gets notified of the user's membership changes
    const relays = uniq([
      ...extraRelays,
      ...this.app.use(Router).FromUser().getUrls(),
      ...getRelayTagValues(event.tags),
    ])

    return new Command(this.app, event, relays)
  }

  addRelay = (url: string) => this.update(builder => builder.addRelay(url))

  // Include the removed relay itself so it also gets notified of its own removal
  removeRelay = (url: string) => this.update(builder => builder.removeRelay(url), [url])

  setRelays = (urls: string[]) => this.update(builder => builder.setRelays(urls))

  addGroup = (groupId: string, url: string) =>
    this.update(builder => builder.addRelay(url).addGroup(groupId, url))

  removeGroup = (groupId: string, url: string) =>
    this.update(builder => builder.removeGroup(groupId, url), [url])
}
