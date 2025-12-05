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

  for (const lnurl of lnurls) {
    if (!lnurl.startsWith("lnurl1")) {
      throw new Error(`Invalid lnurl ${lnurl}`)
    }
  }

  const addZapper = (lnurl: string, info: any) => {
    if (info) {
      try {
        result.set(lnurl, {...info, lnurl})
      } catch (e) {
        // pass
      }
    }
  }

  // Use dufflepud if we it's set up to protect user privacy, otherwise fetch directly
  if (base) {
    const hexUrls = lnurls.map(bech32ToHex)
    const res = await tryCatch(() => postJson(`${base}/zapper/info`, {lnurls: hexUrls}))

    for (const {lnurl, info} of res?.data || []) {
      addZapper(hexToBech32("lnurl", lnurl), info)
    }
  } else {
    await Promise.all(
      lnurls.map(async lnurl => {
        addZapper(lnurl, await tryCatch(() => fetchJson(bech32ToHex(lnurl))))
      }),
    )
  }

  if (result.size > 0) {
    zappersByLnurl.update($zappersByLnurl => {
      for (const [lnurl, zapper] of result) {
        $zappersByLnurl.set(lnurl, zapper)
      }

      return $zappersByLnurl
    })

    for (const zapper of result.values()) {
      notifyZapper(zapper)
    }
  }

  return lnurls.map(lnurl => result.get(lnurl))
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
