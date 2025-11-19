import {derived} from "svelte/store"
import {
  uniq,
  removeUndefined,
  prop,
  indexBy,
  batch,
  fetchJson,
  postJson,
  Maybe,
} from "@welshman/lib"
import {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile} from "@welshman/util"
import {makeCollection} from "@welshman/store"
import {appContext} from "./context.js"

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
    profilesByUrl.set(url, {...info, url})
  }

  return profilesByUrl
}

export const fetchRelayProfiles = (urls: string[]) =>
  appContext.dufflepudUrl
    ? fetchRelayProfilesUsingProxy(appContext.dufflepudUrl, urls)
    : fetchRelayProfilesDirectly(urls)

export const relays = makeCollection<RelayProfile>({
  name: "relays",
  getKey: relay => relay.url,
  load: batch(800, async (raw: string[]) => {
    const relaysByUrl = await fetchRelayProfiles(uniq(raw.map(normalizeRelayUrl)))

    relays.stream.update(Array.from(relaysByUrl.values()))
  }),
})

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(relays.one(url), displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(relays.one$(url), $relay => displayRelayProfile($relay, displayRelayUrl(url)))
