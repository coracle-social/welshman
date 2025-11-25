import {Scope, FeedController, FeedControllerOptions, Feed} from "@welshman/feeds"
import {pubkey, signer} from "./session.js"
import {getWotGraph, getMaxWot, getFollows, getNetwork, getFollowers} from "./wot.js"

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
  const $maxWot = getMaxWot()
  const thresholdMin = $maxWot * min
  const thresholdMax = $maxWot * max

  for (const [tpk, score] of getWotGraph().entries()) {
    if (score >= thresholdMin && score <= thresholdMax) {
      pubkeys.push(tpk)
    }
  }

  return pubkeys
}

type MakeFeedControllerOptions = Partial<Omit<FeedControllerOptions, "feed">> & {feed: Feed}

export const makeFeedController = (options: MakeFeedControllerOptions) =>
  new FeedController({getPubkeysForScope, getPubkeysForWOTRange, signer: signer.get(), ...options})
