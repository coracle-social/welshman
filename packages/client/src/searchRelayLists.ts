import {SEARCH_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import type {ClientContext} from "./client.js"
import type {RelayLists} from "./relayLists.js"

/**
 * NIP-51 search relay lists (kind 10007), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class SearchRelayLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(
    ctx: ClientContext,
    readonly relayLists: RelayLists,
  ) {
    super(ctx, {
      filters: [{kinds: [SEARCH_RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: searchRelayList => searchRelayList.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.relayLists.makeOutboxLoader(SEARCH_RELAYS)(pubkey, relayHints)
  }
}
