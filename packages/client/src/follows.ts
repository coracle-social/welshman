import {FOLLOWS, asDecryptedEvent, readList} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * Kind-3 follow lists, keyed by pubkey. Loaded via the outbox model (the
 * author's write relays), so it depends on the relay-list collection.
 */
export class FollowLists extends RepositoryCollection<ReturnType<typeof readList>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [FOLLOWS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: followList => followList.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).loadUsingOutbox(pubkey, {kinds: [FOLLOWS]}, relayHints)
  }
}
