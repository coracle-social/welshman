import {PINS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * NIP-51 pin lists (kind 10001), keyed by pubkey. Loaded via the outbox model
 * (the author's write relays), so it depends on the relay-list collection.
 */
export class PinLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [PINS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: pins => pins.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).makeOutboxLoader(PINS)(pubkey, relayHints)
  }
}
