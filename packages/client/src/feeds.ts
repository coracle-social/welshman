import {Scope, FeedController} from "@welshman/feeds"
import type {FeedControllerOptions, Feed} from "@welshman/feeds"
import type {AdapterContext} from "@welshman/net"
import type {ClientContext} from "./client.js"
import type {Wot} from "./wot.js"

export type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {feed: Feed}

/**
 * Builds `FeedController`s wired to this client. Scope/WOT pubkey resolution is
 * delegated to the injected `Wot`, and feeds fetch through THIS client's net
 * context (pool + repository) rather than the global one.
 */
export class Feeds {
  constructor(
    readonly ctx: ClientContext,
    readonly wot: Wot,
  ) {}

  getPubkeysForScope = (scope: Scope): string[] => {
    const $pubkey = this.ctx.user?.pubkey

    if (!$pubkey) {
      return []
    }

    switch (scope) {
      case Scope.Self:
        return [$pubkey]
      case Scope.Follows:
        return this.wot.getFollows($pubkey)
      case Scope.Network:
        return this.wot.getNetwork($pubkey)
      case Scope.Followers:
        return this.wot.getFollowers($pubkey)
      default:
        return []
    }
  }

  getPubkeysForWOTRange = (min: number, max: number): string[] => {
    const pubkeys = []
    const $maxWot = this.wot.getMaxWot() ?? 0
    const thresholdMin = $maxWot * min
    const thresholdMax = $maxWot * max

    for (const [tpk, score] of this.wot.getWotGraph().entries()) {
      if (score >= thresholdMin && score <= thresholdMax) {
        pubkeys.push(tpk)
      }
    }

    return pubkeys
  }

  // The net seam: route feed requests through this client's pool/repository so
  // feeds fetch through THIS client rather than the global net context.
  get netContext(): AdapterContext {
    return {pool: this.ctx.pool, repository: this.ctx.repository}
  }

  makeFeedController = (options: MakeFeedControllerOptions) =>
    new FeedController({
      getPubkeysForScope: this.getPubkeysForScope,
      getPubkeysForWOTRange: this.getPubkeysForWOTRange,
      signer: this.ctx.user?.signer,
      context: this.netContext,
      ...options,
    })
}
