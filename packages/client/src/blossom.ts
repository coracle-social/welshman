import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {DerivedData} from "./clientData.js"
import {Network} from "./network.js"
import type {IClient} from "./client.js"

/**
 * Blossom server lists (kind 10063), keyed by pubkey. Loaded via the outbox
 * model (the author's write relays), so it depends on the relay-list collection.
 */
export class BlossomServerLists extends DerivedData<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [BLOSSOM_SERVERS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: list => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(Network).loadUsingOutbox(pubkey, {kinds: [BLOSSOM_SERVERS]}, relayHints)
  }
}
