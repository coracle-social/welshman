import {Scope, FeedController} from "@welshman/feeds"
import type {FeedControllerOptions, Feed as FeedDefinition} from "@welshman/feeds"
import {Address, FEED} from "@welshman/util"
import {Feed, FeedReader, FeedWriter} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Domain} from "./domain.js"
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
      eventToItem: app.use(Domain).reader(Feed),
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
    const writer = this.app.use(Domain).writer(Feed).setIdentifier().setTitle(fields.title)

    if (fields.description) writer.setDescription(fields.description)

    writer.setDefinition(fields.definition)

    return this.app.use(Domain).command(writer)
  }

  update = async (address: string, fn: (writer: FeedWriter) => void) => {
    const feed = await this.forceLoad(address)

    if (!feed) throw new Error(`Unknown feed ${address}`)

    const writer = this.app.use(Domain).writer(Feed, feed)

    fn(writer)

    return this.app.use(Domain).command(writer)
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

  makeFeedController = (options: MakeFeedControllerOptions) =>
    new FeedController({
      router: this.app.use(Router),
      getPubkeysForScope: this.getPubkeysForScope,
      getPubkeysForWOTRange: this.getPubkeysForWOTRange,
      signer: this.app.user?.signer,
      context: {
        pool: this.app.pool,
        repository: this.app.repository,
      },
      ...options,
    })
}
