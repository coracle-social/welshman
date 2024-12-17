import {ctx, nthEq, now} from "@welshman/lib"
import {createEvent, getPubkeyTagValues} from "@welshman/util"
import {Scope, FeedController} from "@welshman/feeds"
import type {RequestOpts, FeedOptions, DVMOpts, Feed} from "@welshman/feeds"
import {makeDvmRequest, DVMEvent} from "@welshman/dvm"
import {makeSecret, Nip01Signer} from "@welshman/signer"
import {pubkey, signer} from "./session.js"
import {getFilterSelections} from "./router.js"
import {loadRelaySelections} from "./relaySelections.js"
import {wotGraph, maxWot, getFollows, getNetwork, getFollowers} from "./wot.js"
import {load} from "./subscribe.js"

export const request = async ({filters = [{}], relays = [], onEvent}: RequestOpts) => {
  if (relays.length > 0) {
    await load({onEvent, filters, relays})
  } else {
    await Promise.all(getFilterSelections(filters).map(opts => load({onEvent, ...opts})))
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
  const relays = request.relays
    ? ctx.app.router.FromRelays(request.relays).getUrls()
    : ctx.app.router.FromPubkeys(getPubkeyTagValues(tags)).getUrls()

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

  const event = await $signer.sign(createEvent(kind, {tags}))
  const req = makeDvmRequest({event, relays})

  await new Promise<void>(resolve => {
    req.emitter.on(DVMEvent.Result, (url, event) => {
      onEvent(event)
      resolve()
    })
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

export const createFeedController = (options: _FeedOptions) =>
  new FeedController({
    request,
    requestDVM,
    getPubkeysForScope,
    getPubkeysForWOTRange,
    ...options,
  })
