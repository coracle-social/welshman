import {writable, derived} from "svelte/store"
import {withGetter} from "@welshman/store"
import {uniq, batcher, postJson} from "@welshman/lib"
import {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile, isRelayUrl} from "@welshman/util"
import {collection} from "@welshman/store"
import {appContext} from "./context.js"

export const relays = withGetter(writable<RelayProfile[]>([]))

export const fetchRelayProfiles = async (urls: string[]) => {
  const profilesByUrl = new Map<string, RelayProfile>()

  if (appContext.dufflepudUrl) {
    const res: any = await postJson(`${appContext.dufflepudUrl}/relay/info`, {urls})

    for (const {url, info} of res?.data || []) {
      profilesByUrl.set(url, info)
    }
  } else {
    await Promise.all(
      urls.map(async url => {
        try {
          const res = await fetch(url.replace(/^ws/, "http"), {
            headers: {
              Accept: "application/nostr+json",
            },
          })

          profilesByUrl.set(url, await res.json())
        } catch (e) {
          // pass
        }
      }),
    )
  }

  return profilesByUrl
}

export const {
  indexStore: relaysByUrl,
  deriveItem: deriveRelay,
  loadItem: loadRelay,
  onItem: onRelay,
} = collection({
  name: "relays",
  store: relays,
  getKey: (relay: RelayProfile) => relay.url,
  load: batcher(800, async (rawUrls: string[]) => {
    const urls = rawUrls.map(normalizeRelayUrl)
    const fresh = await fetchRelayProfiles(uniq(urls))
    const stale = relaysByUrl.get()

    for (const url of urls) {
      const profile = fresh.get(url)

      if (!url || !isRelayUrl(url)) {
        console.warn(`Attempted to load invalid relay url: ${url}`)
        continue
      }

      if (profile) {
        stale.set(url, {...profile, url})
      }
    }

    relays.set(Array.from(stale.values()))

    return urls
  }),
})

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(relaysByUrl.get().get(url), displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(deriveRelay(url), $relay => displayRelayProfile($relay, displayRelayUrl(url)))
