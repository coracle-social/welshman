import {MESSAGING_RELAYS} from "@welshman/util"
import {
  MessagingRelayList,
  MessagingRelayListReader,
  MessagingRelayListWriter,
} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Kind-10050 messaging relay lists (NIP-17), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class MessagingRelayLists extends DerivedPlugin<MessagingRelayListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MESSAGING_RELAYS]}],
      eventToItem: app.use(Domain).reader(MessagingRelayList),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [MESSAGING_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  update = async (fn: (writer: MessagingRelayListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app
      .use(Domain)
      .writer(MessagingRelayList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  addUrl = (url: string) => this.update(writer => writer.addUrl(url))

  removeUrl = (url: string) => this.update(writer => writer.removeUrl(url))

  setUrls = (urls: string[]) => this.update(writer => writer.setUrls(urls))
}
