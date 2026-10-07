import {BLOSSOM_SERVERS} from "@welshman/util"
import {BlossomServerList, BlossomServerListReader, BlossomServerListWriter} from "@welshman/domain"
import {Domain} from "./domain.js"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "@welshman/store"
import {Network} from "./network.js"
import type {IApp} from "../app.js"

/**
 * Blossom server lists (kind 10063), keyed by pubkey. Loaded via the outbox
 * model (the author's write relays), so it depends on the relay-list collection.
 */
export class BlossomServerLists extends DerivedPlugin<BlossomServerListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [BLOSSOM_SERVERS]}],
      eventToItem: app.use(Domain).reader(BlossomServerList),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [BLOSSOM_SERVERS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  update = (fn: (writer: BlossomServerListWriter) => void) =>
    this.app.use(Domain).update(BlossomServerList, this.forceLoad, fn)

  addUrl = (url: string) => this.update(writer => writer.addUrl(url))

  removeUrl = (url: string) => this.update(writer => writer.removeUrl(url))

  setUrls = (urls: string[]) => this.update(writer => writer.setUrls(urls))
}
