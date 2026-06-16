import {BLOCKED_RELAYS, asDecryptedEvent, readList, getRelaysFromList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * Kind-10006 blocked-relay lists, keyed by pubkey. Loaded via the outbox model,
 * so it depends on the relay-list collection. Feeds `RelayStats.getQuality` so
 * blocked relays are never selected.
 */
export class BlockedRelayLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [BLOCKED_RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: list => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).loadUsingOutbox(pubkey, {kinds: [BLOCKED_RELAYS]}, relayHints)
  }

  getBlockedRelays = (pubkey: string) => getRelaysFromList(this.get(pubkey))
}
