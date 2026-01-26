import {writable, derived, Subscriber} from "svelte/store"
import {fetchJson, Maybe} from "@welshman/lib"
import {RelayProfile} from "@welshman/util"
import {displayRelayUrl, displayRelayProfile} from "@welshman/util"
import {getter, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem} from "@welshman/store"

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

export const fetchRelay = async (url: string): Promise<Maybe<RelayProfile>> => {
  try {
    const json = await fetchJson(url.replace(/^ws/, "http"), {
      headers: {
        Accept: "application/nostr+json",
      },
    })

    if (json) {
      const info = {...json, url}

      if (!Array.isArray(info.supported_nips)) {
        info.supported_nips = []
      }

      info.supported_nips = info.supported_nips.map(String)

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

export const forceLoadRelay = makeForceLoadItem(fetchRelay, getRelay)

export const loadRelay = makeLoadItem(fetchRelay, getRelay)

export const deriveRelay = makeDeriveItem(relaysByUrl, loadRelay)

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(getRelay(url), displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(deriveRelay(url), $relay => displayRelayProfile($relay, displayRelayUrl(url)))
