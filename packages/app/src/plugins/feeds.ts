import {Scope, FeedController} from "@welshman/feeds"
import type {FeedControllerOptions, Feed} from "@welshman/feeds"
import type {AdapterContext} from "@welshman/net"
import type {IApp} from "../app.js"
import {Router} from "./router.js"
import {Wot} from "./wot.js"

export type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {feed: Feed}

/**
 * Builds `FeedController`s wired to this app. Scope/WOT pubkey resolution is
 * delegated to `Wot`, and feeds fetch through THIS app's net context (pool +
 * repository) rather than the global one.
 */
export class Feeds {
  constructor(readonly app: IApp) {}

  getPubkeysForScope = (scope: Scope): string[] => {
    const $pubkey = this.app.user?.pubkey

    if (!$pubkey) {
      return []
    }

    switch (scope) {
      case Scope.Self:
        return [$pubkey]
      case Scope.Follows:
        return this.app.use(Wot).follows($pubkey).get()
      case Scope.Network:
        return this.app.use(Wot).network($pubkey).get()
      case Scope.Followers:
        return this.app.use(Wot).followers($pubkey).get()
      default:
        return []
    }
  }

  getPubkeysForWOTRange = (min: number, max: number): string[] => {
    const pubkeys = []
    const $maxWot = this.app.use(Wot).max.get() ?? 0
    const thresholdMin = $maxWot * min
    const thresholdMax = $maxWot * max

    for (const [tpk, score] of this.app.use(Wot).graph.get().entries()) {
      if (score >= thresholdMin && score <= thresholdMax) {
        pubkeys.push(tpk)
      }
    }

    return pubkeys
  }

  // The net seam: route feed requests through this app's pool/repository so
  // feeds fetch through THIS app rather than the global net context.
  get netContext(): AdapterContext {
    return {pool: this.app.pool, repository: this.app.repository}
  }

  makeFeedController = (options: MakeFeedControllerOptions) =>
    new FeedController({
      router: this.app.use(Router),
      getPubkeysForScope: this.getPubkeysForScope,
      getPubkeysForWOTRange: this.getPubkeysForWOTRange,
      signer: this.app.user?.signer,
      context: this.netContext,
      ...options,
    })
}
