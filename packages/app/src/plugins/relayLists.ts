import {uniq} from "@welshman/lib"
import {RELAYS, relayHints, indexers} from "@welshman/util"
import {RelayList, RelayListReader, RelayListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Router} from "./router.js"
import {Network} from "./network.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * NIP-65 relay lists, keyed by pubkey. This is the routing substrate every other
 * outbox-model load depends on (see `Network.loadUsingOutbox`).
 */
export class RelayLists extends DerivedPlugin<RelayListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAYS]}],
      eventToItem: RelayList.factory(app.user?.signer),
      getKey: (list: RelayListReader) => list.author(),
    })
  }

  async fetch(pubkey: string, hints: string[] = []) {
    const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]
    const scenario = await  this.app.use(Router).resolve([...relayHints(hints), indexers()])

    // Resolving `outbox(pubkey)` here would recurse back into this loader (it's
    // what loads the relay list), so fall back to the pubkey's already-known
    // write relays, alongside caller hints and the indexers.
    const relays = uniq([...scenario.getUrls(), ...this.writeUrls(pubkey).get()])

    return this.app.use(Network).load({filters, relays})
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  readUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.readUrls() ?? [])

  writeUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.writeUrls() ?? [])

  update = async (fn: (builder: RelayListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = RelayList.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }
}
