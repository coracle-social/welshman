import {uniq} from "@welshman/lib"
import {RELAYS, relays, indexers} from "@welshman/util"
import {RelayList, RelayListReader, RelayListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "./base.js"
import {Router} from "./router.js"
import {Domain} from "./domain.js"
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
      eventToItem: app.use(Domain).reader(RelayList),
      getKey: (list: RelayListReader) => list.author(),
    })
  }

  async fetch(pubkey: string, hints: string[] = []) {
    const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]
    const scenario = await this.app.use(Router).resolve([...relays(hints), indexers()])

    // Resolving `outbox(pubkey)` here would recurse back into this loader (it's
    // what loads the relay list), so fall back to the pubkey's already-known
    // write relays, alongside caller hints and the indexers.
    const urls = uniq([...scenario.getUrls(), ...this.writeUrls(pubkey).get()])

    return this.app.use(Network).load({filters, relays: urls})
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  readUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.readUrls() ?? [])

  writeUrls = (pubkey: string): Projection<string[]> =>
    this.project(pubkey, list => list?.writeUrls() ?? [])

  update = async (fn: (writer: RelayListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(RelayList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  addReadUrl = (url: string) => this.update(writer => writer.addReadUrl(url))

  addWriteUrl = (url: string) => this.update(writer => writer.addWriteUrl(url))

  removeReadUrl = (url: string) => this.update(writer => writer.removeReadUrl(url))

  removeWriteUrl = (url: string) => this.update(writer => writer.removeWriteUrl(url))

  setReadUrls = (urls: string[]) => this.update(writer => writer.setReadUrls(urls))

  setWriteUrls = (urls: string[]) => this.update(writer => writer.setWriteUrls(urls))
}
