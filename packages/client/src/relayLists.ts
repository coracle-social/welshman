import {chunk, first} from "@welshman/lib"
import {
  RELAYS,
  RelayMode,
  asDecryptedEvent,
  readList,
  getRelaysFromList,
  isPlainReplaceableKind,
  sortEventsDesc,
} from "@welshman/util"
import type {Filter, TrustedEvent, PublishedList} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {addMinimalFallbacks} from "./router.js"
import type {Router} from "./router.js"
import type {ClientContext} from "./client.js"

/**
 * NIP-65 relay lists, keyed by pubkey. This is the routing substrate every
 * other outbox-model load depends on, so it also exposes `loadUsingOutbox` /
 * `makeOutboxLoader` for other collections to build their fetchers on.
 *
 * It depends on a `Router`, and the `Router` depends (via injected functions) on
 * this collection — a genuine domain cycle that `createApp` breaks by wiring the
 * router's `getRelaysForPubkey` to a lazily-resolved closure.
 */
export class RelayLists extends RepositoryCollection<PublishedList> {
  constructor(
    ctx: ClientContext,
    readonly router: Router,
  ) {
    super(ctx, {
      filters: [{kinds: [RELAYS]}],
      eventToItem: (event: TrustedEvent) => readList(asDecryptedEvent(event)),
      getKey: (list: PublishedList) => list.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    const filters = [{kinds: [RELAYS], authors: [pubkey], limit: 1}]

    return Promise.all([
      this.ctx.load({filters, relays: this.router.FromRelays(relayHints).getUrls()}),
      this.ctx.load({filters, relays: this.router.FromPubkey(pubkey).getUrls()}),
      this.ctx.load({filters, relays: this.router.Index().getUrls()}),
    ])
  }

  getRelaysForPubkey = (pubkey: string, mode?: RelayMode) =>
    getRelaysFromList(this.get(pubkey), mode)

  // Load a pubkey's events using their advertised write relays (outbox model)

  loadUsingOutbox = async (kind: number, pubkey: string, filter: Filter = {}) => {
    const filters: Filter[] = [{...filter, kinds: [kind], authors: [pubkey]}]
    const writeRelays = getRelaysFromList(await this.load(pubkey), RelayMode.Write)
    const allRelays = this.router
      .FromRelays(writeRelays)
      .policy(addMinimalFallbacks)
      .limit(8)
      .getUrls()

    if (isPlainReplaceableKind(kind)) {
      filters[0].limit = 1
    }

    for (const relays of chunk(2, allRelays)) {
      const events = await this.ctx.load({filters, relays})

      if (events.length > 0) {
        return first(sortEventsDesc(events))
      }
    }
  }

  makeOutboxLoader =
    (kind: number, filter: Filter = {}) =>
    async (pubkey: string, relayHints: string[] = []) => {
      const filters: Filter[] = [{...filter, kinds: [kind], authors: [pubkey]}]
      const relays = this.router.FromRelays(relayHints).getUrls()

      await Promise.all([
        this.ctx.load({filters, relays}),
        this.loadUsingOutbox(kind, pubkey, filter),
      ])
    }
}
