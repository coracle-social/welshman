import {RelayMode} from "@welshman/util"
import {Router as BaseRouter} from "@welshman/router"
import {RelayLists} from "./relayLists.js"
import {RelayStats} from "./relayStats.js"
import type {IApp} from "../app.js"

/**
 * The upstream `@welshman/router` Router, wired to this app: relay lists come
 * from the `RelayLists` collection, quality from `RelayStats`, and the user
 * pubkey + relay-getters from the app (via `app.config`). Reach it via
 * `app.use(Router)`. This replaces the old forked copy — one source of truth,
 * no global `routerContext`/`Router.get()`.
 */
export class Router extends BaseRouter {
  constructor(app: IApp) {
    super({
      getUserPubkey: () => app.user?.pubkey,
      getPubkeyRelays: (pubkey, mode) =>
        (mode === RelayMode.Read
          ? app.use(RelayLists).readUrls(pubkey)
          : app.use(RelayLists).writeUrls(pubkey)
        ).get(),
      getRelayQuality: url => app.use(RelayStats).getQuality(url),
      getDefaultRelays: app.config.getDefaultRelays,
      getIndexerRelays: app.config.getIndexerRelays,
      getSearchRelays: app.config.getSearchRelays,
    })
  }
}
