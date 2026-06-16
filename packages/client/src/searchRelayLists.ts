import {SEARCH_RELAYS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * NIP-51 search relay lists (kind 10007), keyed by pubkey. Loaded via the
 * outbox model (the author's write relays), so it depends on the relay-list
 * collection.
 */
export class SearchRelayLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [SEARCH_RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: searchRelayList => searchRelayList.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).loadUsingOutbox(pubkey, {kinds: [SEARCH_RELAYS]}, relayHints)
  }
}
