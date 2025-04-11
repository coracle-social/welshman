import {nthEq, partition, race, now} from "@welshman/lib"
import {createEvent, getPubkeyTagValues, TrustedEvent} from "@welshman/util"
import {request, Tracker} from "@welshman/net"
import {Scope, FeedController, RequestOpts, FeedOptions, DVMOpts, Feed} from "@welshman/feeds"
import {makeDvmRequest} from "@welshman/dvm"
import {makeSecret, Nip01Signer} from "@welshman/signer"
import {pubkey, signer} from "./session.js"
import {Router, addMinimalFallbacks, getFilterSelections} from "./router.js"
import {loadRelaySelections} from "./relaySelections.js"
import {wotGraph, maxWot, getFollows, getNetwork, getFollowers} from "./wot.js"
import {repository} from "./core.js"

export type FeedRequestHandlerOptions = {
  signal?: AbortSignal
}

export const makeFeedRequestHandler = ({signal}: FeedRequestHandlerOptions) =>
  async ({filters = [{}], relays = [], onEvent}: RequestOpts) => {
    const tracker = new Tracker()
    const requestOptions = {}

    if (relays.length > 0) {
      await request({tracker, signal, relays, filters, onEvent, autoClose: true})
    } else {
      const promises: Promise<TrustedEvent[]>[] = []
      const [withSearch, withoutSearch] = partition(f => Boolean(f.search), filters)

      if (withSearch.length > 0) {
        promises.push(
          request({
            signal,
            tracker,
            onEvent,
            threshold: 0.1,
            autoClose: true,
            filters: withSearch,
            relays: Router.get().Search().getUrls(),
          }),
        )
      }

      if (withoutSearch.length > 0) {
        promises.push(
          ...getFilterSelections(filters).flatMap(({relays, filters}) =>
            request({tracker, signal, onEvent, relays, filters, threshold: 0.8, autoClose: true}),
          ),
        )
      }

      // Break out selections by relay so we can complete early after a certain number
      // of requests complete for faster load times
      await race(withSearch.length > 0 ? 0.1 : 0.8, promises)

      // Wait until after we've queried the network to access our local cache. This results in less
      // snappy response times, but is necessary to prevent stale stuff that the user has already seen
      // from showing up at the top of the feed
      for (const event of repository.query(filters)) {
        onEvent(event)
      }
    }
  }

export const requestDVM = async ({kind, onEvent, ...request}: DVMOpts) => {
  // Make sure we know what relays to use for target dvms
  if (request.tags && !request.relays) {
    for (const pubkey of getPubkeyTagValues(request.tags)) {
      await loadRelaySelections(pubkey)
    }
  }

  const tags = request.tags || []
  const $signer = signer.get() || new Nip01Signer(makeSecret())
  const pubkey = await $signer.getPubkey()
  const relays =
    request.relays ||
    Router.get().FromPubkeys(getPubkeyTagValues(tags)).policy(addMinimalFallbacks).getUrls()

  if (!tags.some(nthEq(0, "expiration"))) {
    tags.push(["expiration", String(now() + 60)])
  }

  if (!tags.some(nthEq(0, "relays"))) {
    tags.push(["relays", ...relays])
  }

  if (!tags.some(nthEq(1, "user"))) {
    tags.push(["param", "user", pubkey])
  }

  if (!tags.some(nthEq(1, "max_results"))) {
    tags.push(["param", "max_results", "200"])
  }

  await makeDvmRequest({
    relays,
    event: await $signer.sign(createEvent(kind, {tags})),
    onResult: onEvent,
  })
}

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

type _FeedOptions = Partial<Omit<FeedOptions, "feed">> & {feed: Feed}

export const createFeedController = (options: _FeedOptions) => {
  const request = makeFeedRequestHandler(options)

  return new FeedController({
    request,
    requestDVM,
    getPubkeysForScope,
    getPubkeysForWOTRange,
    ...options,
  })
}
