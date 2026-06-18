import {
  SEARCH_RELAYS,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  makeList,
  makeEvent,
  addToListPublicly,
  removeFromList,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Thunks} from "./thunk.js"
import type {IApp} from "../app.js"

/**
 * NIP-51 search relay lists (kind 10007), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class SearchRelayLists extends DerivedPlugin<ReturnType<typeof readList>> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SEARCH_RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: searchRelayList => searchRelayList.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [SEARCH_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => getRelaysFromList(list))

  addRelay = async (url: string) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: SEARCH_RELAYS})
    const event = await addToListPublicly(list, ["relay", url]).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  removeRelay = async (url: string) => {
    const user = User.require(this.app)
    const list = (await this.forceLoad(user.pubkey)) || makeList({kind: SEARCH_RELAYS})
    const event = await removeFromList(list, url).reconcile(user.nip44EncryptToSelf)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  setRelays = (urls: string[]) =>
    this.app.use(Thunks).publish({
      event: makeEvent(SEARCH_RELAYS, {tags: urls.map(url => ["relay", url])}),
      relays: this.app.use(Router).FromUser().getUrls(),
    })
}
