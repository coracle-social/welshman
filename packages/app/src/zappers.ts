import {writable, derived} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {type Zapper} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {uniq, identity, bech32ToHex, tryCatch, uniqBy, batcher, postJson} from '@welshman/lib'
import {AppContext} from './core'
import {collection} from './collection'
import {deriveProfile} from './profiles'

export const zappers = withGetter(writable<Zapper[]>([]))

export const fetchZappers = (lnurls: string[]) => {
  const base = AppContext.DUFFLEPUD_URL!

  if (!base) {
    throw new Error("DUFFLEPUD_URL is required to fetch zapper info")
  }

  const zappersByLnurl = new Map<string, Zapper>()
  const res: any = postJson(`${base}/zapper/info`, {
    lnurls: lnurls.map(lnurl => tryCatch(() => bech32ToHex(lnurl))).filter(identity),
  })

  for (const {lnurl, info} of res?.data || []) {
    tryCatch(() => zappersByLnurl.set(bech32ToHex(lnurl), info))
  }

  return zappersByLnurl
}

export const {
  indexStore: zappersByLnurl,
  deriveItem: deriveZapper,
  loadItem: loadZapper,
} = collection({
  name: "zappers",
  store: zappers,
  getKey: (zapper: Zapper) => zapper.lnurl,
  load: batcher(800, async (lnurls: string[]) => {
    const fresh = await fetchZappers(uniq(lnurls))
    const stale = zappersByLnurl.get()
    const items: Zapper[] = lnurls.map(lnurl => {
      const zapper = fresh.get(lnurl) || stale.get(lnurl) || {}

      return {...zapper, lnurl}
    })

    zappers.update($zappers => uniqBy($zapper => $zapper.lnurl, [...$zappers, ...items]))

    return items
  }),
})

export const deriveZapperForPubkey = (pubkey: string, request: Partial<SubscribeRequest> = {}) =>
  derived(
    [zappersByLnurl, deriveProfile(pubkey, request)],
    ([$zappersByLnurl, $profile]) =>
      $profile?.lnurl ? $zappersByLnurl.get($profile?.lnurl) : undefined
  )

