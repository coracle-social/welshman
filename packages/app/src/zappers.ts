import {writable, derived} from "svelte/store"
import {Zapper, TrustedEvent, Zap, getTagValues, getLnUrl, zapFromEvent} from "@welshman/util"
import {
  removeUndefined,
  fetchJson,
  uniq,
  bech32ToHex,
  hexToBech32,
  tryCatch,
  batch,
  postJson,
} from "@welshman/lib"
import {makeCollection} from "@welshman/store"
import {profiles} from "./profiles.js"
import {appContext} from "./context.js"

export const fetchZappers = async (lnurls: string[]) => {
  const base = appContext.dufflepudUrl
  const zappersByLnurl = new Map<string, Zapper>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const hexUrls = removeUndefined(lnurls.map(lnurl => tryCatch(() => bech32ToHex(lnurl))))

    if (hexUrls.length > 0) {
      const res: any = await tryCatch(
        async () => await postJson(`${base}/zapper/info`, {lnurls: hexUrls}),
      )

      for (const {lnurl, info} of res?.data || []) {
        tryCatch(() => zappersByLnurl.set(hexToBech32("lnurl", lnurl), {...info, lnurl}))
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
        zappersByLnurl.set(lnurl, {...info, lnurl})
      }
    }
  }

  return zappersByLnurl
}

export const zappers = makeCollection<Zapper>({
  name: "zappers",
  getKey: zapper => zapper.lnurl,
  load: batch(800, async (lnurls: string[]) => {
    const zappersByLnurl = await fetchZappers(uniq(lnurls))

    zappers.stream.update(Array.from(zappersByLnurl.values()))
  }),
})

export const loadZapperForPubkey = async (pubkey: string, relays: string[] = []) => {
  const $profile = await profiles.load(pubkey, relays)

  if (!$profile?.lnurl) {
    return undefined
  }

  return zappers.load($profile.lnurl)
}

export const deriveZapperForPubkey = (pubkey: string, relays: string[] = []) =>
  derived([zappers.map$, profiles.one$(pubkey, relays)], ([$map, $profile]) => {
    if (!$profile?.lnurl) {
      return undefined
    }

    zappers.load($profile.lnurl)

    return $map.get($profile.lnurl)
  })

export const getLnUrlsForEvent = async (event: TrustedEvent) => {
  const lnurls = removeUndefined(getTagValues("zap", event.tags).map(getLnUrl))

  if (lnurls.length > 0) {
    return lnurls
  }

  const profile = await profiles.load(event.pubkey)

  return removeUndefined([profile?.lnurl])
}

export const getZapperForZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
  const lnurls = await getLnUrlsForEvent(parent)

  return lnurls.length > 0 ? zappers.load(lnurls[0]) : undefined
}

export const getValidZap = async (zap: TrustedEvent, parent: TrustedEvent) => {
  const zapper = await getZapperForZap(zap, parent)

  return zapper ? zapFromEvent(zap, zapper) : undefined
}

export const getValidZaps = async (zaps: TrustedEvent[], parent: TrustedEvent) =>
  removeUndefined(await Promise.all(zaps.map(zap => getValidZap(zap, parent))))

export const deriveValidZaps = (zaps: TrustedEvent[], parent: TrustedEvent) => {
  const store = writable<Zap[]>([])

  getValidZaps(zaps, parent).then(validZaps => {
    store.set(validZaps)
  })

  return store
}
