import {writable, derived, Subscriber} from "svelte/store"
import {batcher, fetchJson, postJson, Maybe, noop} from "@welshman/lib"
import {RelayProfile} from "@welshman/util"
import {displayRelayUrl, displayRelayProfile} from "@welshman/util"
import {getter, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem} from "@welshman/store"
import {appContext} from "./context.js"

export const relaysByUrl = writable(new Map<string, RelayProfile>())

export const relays = deriveItems(relaysByUrl)

export const getRelaysByUrl = getter(relaysByUrl)

export const getRelays = getter(relays)

export const getRelay = (url: string) => getRelaysByUrl().get(url)

export const relaySubscribers: Subscriber<RelayProfile>[] = []

export const notifyRelay = (relay: RelayProfile) => relaySubscribers.forEach(sub => sub(relay))

export const onRelay = (sub: (relay: RelayProfile) => void) => {
  relaySubscribers.push(sub)

  return () =>
    relaySubscribers.splice(
      relaySubscribers.findIndex(s => s === sub),
      1,
    )
}

export const fetchRelayDirectly = async (url: string): Promise<Maybe<RelayProfile>> => {
  try {
    const json = await fetchJson(url.replace(/^ws/, "http"), {
      headers: {
        Accept: "application/nostr+json",
      },
    })

    if (json) {
      const info = {...json, url}

      relaysByUrl.update($relaysByUrl => {
        $relaysByUrl.set(url, info)

        return $relaysByUrl
      })

      notifyRelay(info)

      return info
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
  const result = new Map<string, RelayProfile>()

  for (const {url, info} of res?.data || []) {
    if (info) {
      result.set(url, {...info, url})
    }
  }

  relaysByUrl.update($relaysByUrl => {
    for (const [url, info] of result) {
      $relaysByUrl.set(url, info)
    }

    return $relaysByUrl
  })

  for (const info of result.values()) {
    notifyRelay(info)
  }

  return urls.map(url => result.get(url))
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
