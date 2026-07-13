import {FEEDS} from "@welshman/util"
import {FeedList, FeedListReader, FeedListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 saved feeds lists (kind 10014), keyed by pubkey. Loaded via the outbox
 * model (the author's write relays), so it depends on the relay-list collection.
 */
export class FeedLists extends DerivedPlugin<FeedListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [FEEDS]}],
      eventToItem: app.use(Domain).reader(FeedList),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [FEEDS]}, relayHints)
  }

  addresses = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.addresses() ?? [])

  update = async (fn: (writer: FeedListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(FeedList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  addFeed = (address: string, relayHint?: string) =>
    this.update(writer => writer.addFeed(address, relayHint))

  addFeedPrivately = (address: string, relayHint?: string) =>
    this.update(writer => writer.addFeedPrivately(address, relayHint))

  removeFeed = (address: string) => this.update(writer => writer.removeFeed(address))
}
