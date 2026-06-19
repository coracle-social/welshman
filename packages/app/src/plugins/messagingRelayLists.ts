import {MESSAGING_RELAYS} from "@welshman/util"
import {MessagingRelayList, MessagingRelayListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {User} from "../user.js"
import {Thunks} from "./thunk.js"
import type {IApp} from "../app.js"

/**
 * Kind-10050 messaging relay lists (NIP-17), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class MessagingRelayLists extends DerivedPlugin<MessagingRelayList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MESSAGING_RELAYS]}],
      eventToItem: MessagingRelayList.factory(app.user?.signer),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [MESSAGING_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.urls() ?? [])

  update = async (fn: (builder: MessagingRelayListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new MessagingRelayListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  addUrl = (url: string) => this.update(builder => builder.addUrl(url))

  removeUrl = (url: string) => this.update(builder => builder.removeUrl(url))

  setUrls = (urls: string[]) => this.update(builder => builder.setUrls(urls))
}
