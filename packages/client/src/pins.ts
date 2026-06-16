import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import type {ClientContext} from "./client.js"
import type {RelayLists} from "./relayLists.js"

/**
 * NIP-51 pin lists (kind 10001), keyed by pubkey. Loaded via the outbox model
 * (the author's write relays), so it depends on the relay-list collection.
 */
export class PinLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(
    ctx: ClientContext,
    readonly relayLists: RelayLists,
  ) {
    super(ctx, {
      filters: [{kinds: [PINS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: pins => pins.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.relayLists.makeOutboxLoader(PINS)(pubkey, relayHints)
  }
}
