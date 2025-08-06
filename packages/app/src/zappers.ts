import {writable, derived} from "svelte/store"
import {Zapper, TrustedEvent, Zap, getTagValues, getLnUrl, zapFromEvent} from "@welshman/util"
import {
  removeNil,
  fetchJson,
  uniq,
  bech32ToHex,
  hexToBech32,
  tryCatch,
  batcher,
  postJson,
} from "@welshman/lib"
import {collection} from "@welshman/store"
import {deriveProfile, loadProfile} from "./profiles.js"
import {appContext} from "./context.js"

export const zappers = writable<Zapper[]>([])

export const fetchZappers = async (lnurls: string[]) => {
  const base = appContext.dufflepudUrl
  const zappersByLnurl = new Map<string, Zapper>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const hexUrls = removeNil(lnurls.map(lnurl => tryCatch(() => bech32ToHex(lnurl))))

    if (hexUrls.length > 0) {
      const res: any = await tryCatch(
        async () => await postJson(`${base}/zapper/info`, {lnurls: hexUrls}),
      )

      for (const {lnurl, info} of res?.data || []) {
        tryCatch(() => zappersByLnurl.set(hexToBech32("lnurl", lnurl), info))
      }
    }
  } else {
    const results = await Promise.all(
      lnurls.map(async lnurl => {
        const hexUrl = tryCatch(() => bech32ToHex(lnurl))
        const info = hexUrl ? await tryCatch(async () => await fetchJson(hexUrl)) : undefined

        return {lnurl, hexUrl, info}
      }),
    )

    for (const {lnurl, info} of results) {
      if (info) {
        zappersByLnurl.set(lnurl, info)
      }
    }
  }

  return zappersByLnurl
}

export const {
  indexStore: zappersByLnurl,
  deriveItem: deriveZapper,
  loadItem: loadZapper,
  onItem: onZapper,
} = collection({
  name: "zappers",
  store: zappers,
  getKey: (zapper: Zapper) => zapper.lnurl,
  load: batcher(800, async (lnurls: string[]) => {
    const fresh = await fetchZappers(uniq(lnurls))
    const stale = zappersByLnurl.get()

    for (const lnurl of lnurls) {
      const newZapper = fresh.get(lnurl)

      if (newZapper) {
        stale.set(lnurl, {...newZapper, lnurl})
      }
    }

    zappers.set(Array.from(stale.values()))

    return lnurls
  }),
})

export const loadZapperForPubkey = async (pubkey: string, relays: string[] = []) => {
  const $profile = await loadProfile(pubkey, relays)

  if (!$profile?.lnurl) {
    return undefined
  }

  return loadZapper($profile.lnurl)
}

export const deriveZapperForPubkey = (pubkey: string, relays: string[] = []) =>
  derived([zappersByLnurl, deriveProfile(pubkey, relays)], ([$zappersByLnurl, $profile]) => {
    if (!$profile?.lnurl) {
      return undefined
    }

    loadZapper($profile.lnurl)

    return $zappersByLnurl.get($profile.lnurl)
  })

export const getLnUrlsForEvent = async (event: TrustedEvent) => {
  const lnurls = removeNil(getTagValues("zap", event.tags).map(getLnUrl))

  if (lnurls.length > 0) {
    return lnurls
  }

  const profile = await loadProfile(event.pubkey)

  return removeNil([profile?.lnurl])
}

export const getZapperForZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
  const lnurls = await getLnUrlsForEvent(parent)

  return lnurls.length > 0 ? loadZapper(lnurls[0]) : undefined
}

export const getValidZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
  const zapper = await getZapperForZap(zap, parent)

  return zapper ? zapFromEvent(zap, zapper) : undefined
}

export const getValidZaps = async (zaps: TrustedEvent[], parent: TrustedEvent) =>
  removeNil(await Promise.all(zaps.map(zap => getValidZap(zap, parent))))

export const deriveValidZaps = (zaps: TrustedEvent[], parent: TrustedEvent) => {
  const store = writable<Zap[]>([])

  getValidZaps(zaps, parent).then(validZaps => {
    store.set(validZaps)
  })

  return store
}
