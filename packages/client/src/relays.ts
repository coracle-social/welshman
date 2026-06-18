import {derived} from "svelte/store"
import {fetchone} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {displayRelayUrl, displayRelayProfile} from "@welshman/util"
import type {RelayProfile} from "@welshman/util"
import {LoadableData} from "./clientData.js"

/**
 * NIP-11 relay profiles, keyed by url. A "local" loadable collection: items
 * aren't nostr events, they're fetched over HTTP from each relay.
 */
export class Relays extends LoadableData<RelayProfile> {
  fetch = async (url: string): Promise<Maybe<RelayProfile>> => {
    try {
      const json = await fetchJson(url.replace(/^ws/, "http"), {
        headers: {
          Accept: "application/nostr+json",
        },
      })

      if (json) {
        const info = {...json, url} as RelayProfile

        if (!Array.isArray(info.supported_nips)) {
          info.supported_nips = []
        }

        info.supported_nips = info.supported_nips.map(String)

        this.set(url, info)

        return info
      }
    } catch (e) {
      // pass
    }
  }

  display = (url: string) => displayRelayProfile(this.get(url), displayRelayUrl(url))

  deriveDisplay = (url: string) =>
    derived(this.one(url), $relay => displayRelayProfile($relay, displayRelayUrl(url)))
}
