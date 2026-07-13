import {BLOSSOM_SERVERS} from "@welshman/util"
import {BlossomServerList, BlossomServerListReader} from "@welshman/domain"
import {Domain} from "./domain.js"
import {DerivedPlugin} from "./base.js"
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
}
