import {Router as BaseRouter} from "@welshman/router"
import {RelayLists} from "./relayLists.js"
import {RelayStats} from "./relayStats.js"
import type {IClient} from "../client.js"

// Re-export the upstream router surface (scenarios, fallback policies,
// makeSelection, getFilterSelections, types). The local `Router` below shadows
// the upstream `Router` in this re-export.
export * from "@welshman/router"

/**
 * The upstream `@welshman/router` Router, wired to this client: relay lists come
 * from the `RelayLists` collection, quality from `RelayStats`, and the user
 * pubkey + relay-getters from the client (via `ctx.config`). Reach it via
 * `client.use(Router)`. This replaces the old forked copy — one source of truth,
 * no global `routerContext`/`Router.get()`.
 */
export class Router extends BaseRouter {
  constructor(ctx: IClient) {
    super({
      getUserPubkey: () => ctx.user?.pubkey,
      getPubkeyRelays: (pubkey, mode) => ctx.use(RelayLists).getRelaysForPubkey(pubkey, mode),
      getRelayQuality: url => ctx.use(RelayStats).getQuality(url),
      getDefaultRelays: ctx.config.getDefaultRelays,
      getIndexerRelays: ctx.config.getIndexerRelays,
      getSearchRelays: ctx.config.getSearchRelays,
    })
  }
}
