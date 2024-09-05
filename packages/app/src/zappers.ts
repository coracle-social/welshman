import {writable, derived} from 'svelte/store'
import {withGetter} from '@welshman/store'
import {type Zapper} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {ctx, fetchJson, uniq, bech32ToHex, hexToBech32, tryCatch, batcher, postJson} from '@welshman/lib'
import {collection} from './collection'
import {deriveProfile} from './profiles'

export const zappers = withGetter(writable<Zapper[]>([]))

export const fetchZappers = async (lnurls: string[]) => {
  const base = ctx.app.dufflepudUrl!
  const zappersByLnurl = new Map<string, Zapper>()

  // Attempt fetching directly first
  const results = await Promise.all(
    lnurls.map(async lnurl => {
      const hexUrl = tryCatch(() => bech32ToHex(lnurl))
      const info = hexUrl ? await fetchJson(hexUrl) : undefined

      return {lnurl, hexUrl, info}
    })
  )

  const dufflepudLnurls: string[] = []

  // If we got a response, great, if not (due to CORS), proxy via dufflepud
  for (const {lnurl, hexUrl, info} of results) {
    if (info) {
      zappersByLnurl.set(lnurl, info)
    } else if (hexUrl) {
      dufflepudLnurls.push(hexUrl)
    }
  }

  // Fetch via dufflepud if we have an endpoint
  if (base && dufflepudLnurls.length > 0) {
    const res: any = await postJson(`${base}/zapper/info`, {lnurls: dufflepudLnurls})

    for (const {lnurl, info} of res?.data || []) {
      tryCatch(() => zappersByLnurl.set(hexToBech32("lnurl", lnurl), info))
    }
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
      const newZapper = fresh.get(lnurl)
      const oldZapper = stale.get(lnurl)

      if (newZapper) {
        stale.set(lnurl, {...newZapper, lnurl})
      }

      return {...oldZapper, ...newZapper, lnurl}
    })

    zappers.set(Array.from(stale.values()))

    return items
  }),
})

export const deriveZapperForPubkey = (pubkey: string, request: Partial<SubscribeRequest> = {}) =>
  derived(
    [zappersByLnurl, deriveProfile(pubkey, request)],
    ([$zappersByLnurl, $profile]) => {
      if (!$profile?.lnurl) {
        return undefined
      }

      loadZapper($profile.lnurl)

      return $zappersByLnurl.get($profile.lnurl)
    }
  )

