import {fetchJson} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {displayRelayUrl, displayRelayProfile} from "@welshman/util"
import type {RelayProfile} from "@welshman/util"
import {LoadableMapPlugin} from "./base.js"
import type {Projection} from "./base.js"

/**
 * NIP-11 relay profiles, keyed by url. A "local" loadable collection: items
 * aren't nostr events, they're fetched over HTTP from each relay.
 */
export class Relays extends LoadableMapPlugin<RelayProfile> {
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

  display = (url: string): Projection<string> =>
    this.project(url, $relay => displayRelayProfile($relay, displayRelayUrl(url)))

  hasNegentropy = async (url: string) => {
    const relay = await this.load(url)

    if (relay?.negentropy) return true
    if (relay?.supported_nips?.includes("77")) return true
    if (relay?.software?.includes?.("strfry") && !relay?.version?.match(/^0\./)) return true

    return false
  }

  hasNip = async (url: string, nip: number | string) =>
    (await this.load(url))?.supported_nips?.includes(String(nip)) ?? false
}
