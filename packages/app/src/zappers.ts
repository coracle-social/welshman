import {writable, derived, Subscriber} from "svelte/store"
import {Zapper, TrustedEvent, Zap, getTagValues, getLnUrl, zapFromEvent} from "@welshman/util"
import {
  removeUndefined,
  fetchJson,
  bech32ToHex,
  hexToBech32,
  tryCatch,
  batcher,
  postJson,
} from "@welshman/lib"
import {getter, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem} from "@welshman/store"
import {deriveProfile, loadProfile} from "./profiles.js"
import {appContext} from "./context.js"

export const zappersByLnurl = writable(new Map<string, Zapper>())

export const zappers = deriveItems(zappersByLnurl)

export const getZappersByLnurl = getter(zappersByLnurl)

export const getZapper = (lnurl: string) => getZappersByLnurl().get(lnurl)

export const zapperSubscribers: Subscriber<Zapper>[] = []

export const notifyZapper = (zapper: Zapper) => zapperSubscribers.forEach(sub => sub(zapper))

export const onZapper = (sub: (zapper: Zapper) => void) => {
  zapperSubscribers.push(sub)

  return () =>
    zapperSubscribers.splice(
      zapperSubscribers.findIndex(s => s === sub),
      1,
    )
}

export const fetchZapper = batcher(800, async (lnurls: string[]) => {
  const base = appContext.dufflepudUrl
  const result = new Map<string, Zapper>()

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const hexUrls = removeUndefined(lnurls.map(lnurl => tryCatch(() => bech32ToHex(lnurl))))

    if (hexUrls.length > 0) {
      const res: any = await tryCatch(
        async () => await postJson(`${base}/zapper/info`, {lnurls: hexUrls}),
      )

      for (const {hexUrl, info} of res?.data || []) {
        if (info) {
          const lnurl = hexToBech32("lnurl", hexUrl)

          tryCatch(() => result.set(lnurl, {...info, lnurl}))
        }
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
        result.set(lnurl, {...info, lnurl})
      }
    }
  }

  zappersByLnurl.update($zappersByLnurl => {
    for (const [nip05, info] of result) {
      $zappersByLnurl.set(nip05, info)
    }

    return $zappersByLnurl
  })

  for (const info of result.values()) {
    notifyZapper(info)
  }

  return lnurls.map(lnurl => {
    const info = result.get(lnurl)

    if (info) {
      return {...info, lnurl}
    }
  })
})

export const forceLoadZapper = makeForceLoadItem(fetchZapper, getZapper)

export const loadZapper = makeLoadItem(fetchZapper, getZapper)

export const deriveZapper = makeDeriveItem(zappersByLnurl, loadZapper)

export const loadZapperForPubkey = async (pubkey: string, relays: string[] = []) => {
  const $profile = await loadProfile(pubkey, relays)

  return $profile?.lnurl ? loadZapper($profile.lnurl) : undefined
}

export const deriveZapperForPubkey = (pubkey: string, relays: string[] = []) => {
  loadZapperForPubkey(pubkey, relays)

  return derived([zappersByLnurl, deriveProfile(pubkey, relays)], ([$zappersByLnurl, $profile]) => {
    return $profile?.lnurl ? $zappersByLnurl.get($profile.lnurl) : undefined
  })
}

export const getLnUrlsForEvent = async (event: TrustedEvent) => {
  const lnurls = removeUndefined(getTagValues("zap", event.tags).map(getLnUrl))

  if (lnurls.length > 0) {
    return lnurls
  }

  const profile = await loadProfile(event.pubkey)

  return removeUndefined([profile?.lnurl])
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
  removeUndefined(await Promise.all(zaps.map(zap => getValidZap(zap, parent))))

export const deriveValidZaps = (zaps: TrustedEvent[], parent: TrustedEvent) => {
  const store = writable<Zap[]>([])

  getValidZaps(zaps, parent).then(validZaps => {
    store.set(validZaps)
  })

  return store
}
