import {FEEDS} from "@welshman/util"
import {FeedList, FeedListReader, FeedListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
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
      eventToItem: FeedList.factory(app.user?.signer),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [FEEDS]}, relayHints)
  }

  addresses = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.addresses() ?? [])

  update = async (fn: (builder: FeedListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = FeedList.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }

  addFeed = (address: string, relayHint?: string) =>
    this.update(builder => builder.addFeed(address, relayHint))

  addFeedPrivately = (address: string, relayHint?: string) =>
    this.update(builder => builder.addFeedPrivately(address, relayHint))

  removeFeed = (address: string) => this.update(builder => builder.removeFeed(address))
}
