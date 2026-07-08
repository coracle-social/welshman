import {Scope, FeedController} from "@welshman/feeds"
import type {FeedControllerOptions, Feed as FeedDefinition} from "@welshman/feeds"
import type {AdapterContext} from "@welshman/net"
import {Address, FEED} from "@welshman/util"
import {Feed, FeedReader, FeedBuilder} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Wot} from "./wot.js"
import type {IApp} from "../app.js"

export type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {
  feed: FeedDefinition
}

export type FeedFields = {
  title: string
  description?: string
  definition: FeedDefinition
}

/**
 * NIP-51 kind-31890 saved feeds, keyed by address (many feeds per author).
 * Also builds `FeedController`s wired to this app. Scope/WOT pubkey resolution
 * is delegated to `Wot`, and feeds fetch through THIS app's net context (pool +
 * repository) rather than the global one.
 */
export class Feeds extends DerivedPlugin<FeedReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [FEED]}],
      eventToItem: Feed.factory(app.user?.signer),
      getKey: feed => feed.address(),
    })
  }

  fetch(address: string, relayHints: string[] = []) {
    const {pubkey, identifier} = Address.from(address)

    return this.app
      .use(Network)
      .loadUsingOutbox(pubkey, {kinds: [FEED], "#d": [identifier]}, relayHints)
  }

  forAuthor = (pubkey: string): Projection<FeedReader[]> =>
    projectFrom(this.all, feeds => feeds.filter(feed => feed.author() === pubkey))

  loadForAuthor = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadAllUsingOutbox(pubkey, {kinds: [FEED]}, relayHints)

  create = async (fields: FeedFields) => {
    const builder = Feed.builder().setIdentifier().setTitle(fields.title)

    if (fields.description) builder.setDescription(fields.description)

    builder.setDefinition(fields.definition)

    return this.app.use(Router).commandFromBuilder(builder)
  }

  update = async (address: string, fn: (builder: FeedBuilder) => void) => {
    const feed = await this.forceLoad(address)

    if (!feed) throw new Error(`Unknown feed ${address}`)

    const builder = Feed.builder(feed)

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }

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
