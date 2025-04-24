import {Scope, FeedController, FeedControllerOptions, Feed} from "@welshman/feeds"
import {pubkey, signer} from "./session.js"
import {wotGraph, maxWot, getFollows, getNetwork, getFollowers} from "./wot.js"
import {repository} from "./core.js"

export const getPubkeysForScope = (scope: string) => {
  const $pubkey = pubkey.get()

  if (!$pubkey) {
    return []
  }

  switch (scope) {
    case Scope.Self:
      return [$pubkey]
    case Scope.Follows:
      return getFollows($pubkey)
    case Scope.Network:
      return getNetwork($pubkey)
    case Scope.Followers:
      return getFollowers($pubkey)
    default:
      return []
  }
}

export const getPubkeysForWOTRange = (min: number, max: number) => {
  const pubkeys = []
  const thresholdMin = maxWot.get() * min
  const thresholdMax = maxWot.get() * max

  for (const [tpk, score] of wotGraph.get().entries()) {
    if (score >= thresholdMin && score <= thresholdMax) {
      pubkeys.push(tpk)
    }
  }

  return pubkeys
}

type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {feed: Feed}

export const makeFeedController = (options: MakeFeedControllerOptions) =>
  new FeedController({
    repository,
    getPubkeysForScope,
    getPubkeysForWOTRange,
    signer: signer.get(),
    ...options,
  })
