import {SEARCH_RELAYS} from "@welshman/util"
import {SearchRelayList, SearchRelayListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {User} from "../user.js"
import {Thunks} from "./thunk.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 search relay lists (kind 10007), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class SearchRelayLists extends DerivedPlugin<SearchRelayList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SEARCH_RELAYS]}],
      eventToItem: SearchRelayList.factory(app.user?.signer),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [SEARCH_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  update = async (fn: (builder: SearchRelayListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new SearchRelayListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  addUrl = (url: string) => this.update(builder => builder.addUrl(url))

  removeUrl = (url: string) => this.update(builder => builder.removeUrl(url))

  setUrls = (urls: string[]) => this.update(builder => builder.setUrls(urls))
}
