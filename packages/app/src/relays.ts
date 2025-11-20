import {writable, derived} from "svelte/store"
import {
  uniq,
  removeUndefined,
  prop,
  indexBy,
  batcher,
  fetchJson,
  postJson,
  Maybe,
  noop,
} from "@welshman/lib"
import {withGetter} from "@welshman/store"
import {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile, isRelayUrl} from "@welshman/util"
import {getter, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem} from "@welshman/store"
import {appContext} from "./context.js"

export const relaysByUrl = writable(new Map<string, RelayProfile>())

export const relays = deriveItems(relaysByUrl)

export const getRelaysByUrl = getter(relaysByUrl)

export const getRelays = getter(relays)

export const getRelay = (url: string) => getRelaysByUrl().get(url)

export const fetchRelayDirectly = async (url: string): Promise<Maybe<RelayProfile>> => {
  try {
    const json = fetchJson(url.replace(/^ws/, "http"), {
      headers: {
        Accept: "application/nostr+json",
      },
    })

    if (json) {
      return {...json, url}
    }
  } catch (e) {
    // pass
  }
}

export const fetchRelayUsingProxy = batcher(800, async (urls: string[]) => {
  // Handle a race condition edge case where dufflepud url changes under us
  if (!appContext.dufflepudUrl) {
    return urls.map(noop)
  }

  const res: any = await postJson(`${appContext.dufflepudUrl}/relay/info`, {urls})
  const relaysByUrl = new Map<string, RelayProfile>()

  for (const {url, info} of res?.data || []) {
    relaysByUrl.set(url, info)
  }

  return urls.map(url => {
    const info = relaysByUrl.get(url)

    if (info) {
      return {...info, url}
    }
  })
})

export const fetchRelay = (url: string) =>
  appContext.dufflepudUrl ? fetchRelayUsingProxy(url) : fetchRelayDirectly(url)

export const forceLoadRelay = makeForceLoadItem(fetchRelay, getRelay)

export const loadRelay = makeLoadItem(fetchRelay, getRelay)

export const deriveRelay = makeDeriveItem(relaysByUrl, loadRelay)

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(getRelay(url), displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(deriveRelay(url), $relay => displayRelayProfile($relay, displayRelayUrl(url)))
