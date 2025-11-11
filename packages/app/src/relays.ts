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
} from "@welshman/lib"
import {withGetter} from "@welshman/store"
import {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile, isRelayUrl} from "@welshman/util"
import {collection} from "@welshman/store"
import {appContext} from "./context.js"

export const relays = withGetter(writable<RelayProfile[]>([]))

export const fetchRelayProfileDirectly = async (url: string): Promise<Maybe<RelayProfile>> => {
  try {
    return fetchJson(url.replace(/^ws/, "http"), {
      headers: {
        Accept: "application/nostr+json",
      },
    })
  } catch (e) {
    // pass
  }
}

export const fetchRelayProfilesDirectly = async (
  urls: string[],
): Promise<Map<string, RelayProfile>> =>
  indexBy(
    prop("url"),
    removeUndefined(
      await Promise.all(
        urls.map(async url => {
          const profile = await fetchRelayProfileDirectly(url)

          if (profile) {
            return {...profile, url}
          }
        }),
      ),
    ),
  )

export const fetchRelayProfilesUsingProxy = async (
  proxy: string,
  urls: string[],
): Promise<Map<string, RelayProfile>> => {
  const profilesByUrl = new Map<string, RelayProfile>()
  const res: any = await postJson(`${proxy}/relay/info`, {urls})

  for (const {url, info} of res?.data || []) {
    profilesByUrl.set(url, info)
  }

  return profilesByUrl
}

export const fetchRelayProfiles = (urls: string[]) =>
  appContext.dufflepudUrl
    ? fetchRelayProfilesUsingProxy(appContext.dufflepudUrl, urls)
    : fetchRelayProfilesDirectly(urls)

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
