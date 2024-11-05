import {ctx, now} from '@welshman/lib'
import {createEvent, getPubkeyTagValues} from '@welshman/util'
import {FeedLoader, Scope} from '@welshman/feeds'
import {makeDvmRequest} from '@welshman/dvm'
import {makeSecret, Nip01Signer} from '@welshman/signer'
import {pubkey, signer} from './session'
import {getFilterSelections} from './router'
import {wotGraph, maxWot, getFollows, getNetwork, getFollowers} from './wot'
import {load} from './core'

export const feedLoader = new FeedLoader({
  request: async ({filters = [{}], relays = [], onEvent}) => {
    if (relays.length > 0) {
      await load({onEvent, filters, relays})
    } else {
      await Promise.all(
        getFilterSelections(filters)
          .map(opts =>  load({onEvent, ...opts}))
      )
    }
  },
  requestDVM: async ({kind, onEvent, ...request}) => {
    const tags = [...request.tags || [], ["expiration", String(now() + 5)]]
    const $signer = signer.get() || new Nip01Signer(makeSecret())
    const event = await $signer.sign(createEvent(kind, {tags}))
    const relays =
      request.relays
        ? ctx.app.router.FromRelays(request.relays).getUrls()
        : ctx.app.router.FromPubkeys(getPubkeyTagValues(tags)).getUrls()

    const req = makeDvmRequest({event, relays})

    await new Promise<void>(resolve => {
      req.emitter.on("result", (url, event) => {
        onEvent(event)
        resolve()
      })
    })
  },
  getPubkeysForScope: (scope: string) => {
    const $pubkey = pubkey.get()

    if (!$pubkey) {
      return []
    }

    switch (scope) {
      case Scope.Self: return [$pubkey]
      case Scope.Follows: return getFollows($pubkey)
      case Scope.Network: return getNetwork($pubkey)
      case Scope.Followers: return getFollowers($pubkey)
      default: return []
    }
  },
  getPubkeysForWOTRange: (min, max) => {
    const pubkeys = []
    const thresholdMin = maxWot.get() * min
    const thresholdMax = maxWot.get() * max

    for (const [tpk, score] of wotGraph.get().entries()) {
      if (score >= thresholdMin && score <= thresholdMax) {
        pubkeys.push(tpk)
      }
    }

    return pubkeys
  },
})
