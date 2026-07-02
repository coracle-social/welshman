import {BLOCKED_RELAYS} from "@welshman/util"
import {BlockedRelayList, BlockedRelayListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * Kind-10006 blocked-relay lists, keyed by pubkey. Loaded via the outbox model,
 * so it depends on the relay-list collection. Feeds `RelayStats.getQuality` so
 * blocked relays are never selected.
 */
export class BlockedRelayLists extends DerivedPlugin<BlockedRelayList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [BLOCKED_RELAYS]}],
      eventToItem: BlockedRelayList.factory(app.user?.signer),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [BLOCKED_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  update = async (fn: (builder: BlockedRelayListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new BlockedRelayListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)
    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }

  addUrl = (url: string) => this.update(builder => builder.addUrl(url))

  removeUrl = (url: string) => this.update(builder => builder.removeUrl(url))

  setUrls = (urls: string[]) => this.update(builder => builder.setUrls(urls))
}
