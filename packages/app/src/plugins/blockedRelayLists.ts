import {BLOCKED_RELAYS} from "@welshman/util"
import {BlockedRelayList, BlockedRelayListReader, BlockedRelayListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {Projection} from "@welshman/store"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import type {IApp} from "../app.js"

/**
 * Kind-10006 blocked-relay lists, keyed by pubkey. Loaded via the outbox model,
 * so it depends on the relay-list collection. Feeds `RelayStats.getQuality` so
 * blocked relays are never selected.
 */
export class BlockedRelayLists extends DerivedPlugin<BlockedRelayListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [BLOCKED_RELAYS]}],
      eventToItem: app.use(Domain).reader(BlockedRelayList),
      getKey: list => list.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [BLOCKED_RELAYS]}, relayHints)
  }

  urls = (pubkey: string): Projection<string[]> => this.project(pubkey, list => list?.urls() ?? [])

  update = (fn: (writer: BlockedRelayListWriter) => void) =>
    this.app.use(Domain).update(BlockedRelayList, this.forceLoad, fn)

  addUrl = (url: string) => this.update(writer => writer.addUrl(url))

  removeUrl = (url: string) => this.update(writer => writer.removeUrl(url))

  setUrls = (urls: string[]) => this.update(writer => writer.setUrls(urls))
}
