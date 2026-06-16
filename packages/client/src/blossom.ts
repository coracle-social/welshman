import {BLOSSOM_SERVERS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import type {ClientContext} from "./client.js"
import type {RelayLists} from "./relayLists.js"

/**
 * Blossom server lists (kind 10063), keyed by pubkey. Loaded via the outbox
 * model (the author's write relays), so it depends on the relay-list collection.
 */
export class BlossomServerLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(
    ctx: ClientContext,
    readonly relayLists: RelayLists,
  ) {
    super(ctx, {
      filters: [{kinds: [BLOSSOM_SERVERS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: list => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.relayLists.makeOutboxLoader(BLOSSOM_SERVERS)(pubkey, relayHints)
  }
}
