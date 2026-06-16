import {chunk, first} from "@welshman/lib"
import {
  RELAYS,
  RelayMode,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  sortEventsDesc,
} from "@welshman/util"
import type {Filter, TrustedEvent, PublishedList} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {Router, addMinimalFallbacks} from "./router.js"
import {Networking} from "./networking.js"
import type {IClient} from "./client.js"

/**
 * NIP-65 relay lists, keyed by pubkey. This is the routing substrate every other
 * outbox-model load depends on, so it also exposes `loadUsingOutbox` for other
 * collections to use as their fetcher.
 */
export class RelayLists extends RepositoryCollection<PublishedList> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: (list: PublishedList) => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]
    const networking = this.ctx.use(Networking)
    const router = this.ctx.use(Router)

    return Promise.all([
      networking.load({filters, relays: router.FromRelays(relayHints).getUrls()}),
      networking.load({filters, relays: router.FromPubkey(pubkey).getUrls()}),
      networking.load({filters, relays: router.Index().getUrls()}),
    ])
  }

  getRelaysForPubkey = (pubkey: string, mode?: RelayMode) =>
    getRelaysFromList(this.get(pubkey), mode)

  // Load a pubkey's events using their advertised write relays (outbox model),
  // plus any explicit relay hints. This is the fetcher outbox-loaded collections
  // (profiles, follows, mutes, …) delegate to — it's a stable method, so calling
  // it doesn't build a fresh loader per call.

  loadUsingOutbox = async (pubkey: string, filter: Filter = {}, relayHints: string[] = []) => {
    const filters: Filter[] = [{...filter, authors: [pubkey]}]
    const writeRelays = getRelaysFromList(await this.load(pubkey), RelayMode.Write)
    const allRelays = this.ctx
      .use(Router)
      .FromRelays([...relayHints, ...writeRelays])
      .policy(addMinimalFallbacks)
      .limit(8)
      .getUrls()

    for (const relays of chunk(2, allRelays)) {
      const events = await this.ctx.use(Networking).load({filters, relays})

      if (events.length > 0) {
        return first(sortEventsDesc(events))
      }
    }
  }
}
