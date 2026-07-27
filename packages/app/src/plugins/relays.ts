import {derived} from "svelte/store"
import type {Readable} from "svelte/store"
import type {Maybe} from "@welshman/lib"
import {displayRelayUrl} from "@welshman/util"
import {Relay} from "@welshman/domain"
import {LoadableMapPlugin, RelayScopedDerivedPlugin, createSearch} from "./base.js"
import type {Projection, Search, RelayScopedDerivedPluginOptions} from "./base.js"
import type {IApp} from "../app.js"

/**
 * NIP-11 relay profiles, keyed by url. A "local" loadable collection: items
 * aren't nostr events, they're fetched over HTTP from each relay.
 */
export class Relays extends LoadableMapPlugin<Relay> {
  relaySearch: Readable<Search<string, Relay>> = derived(this.all.$, $relays =>
    createSearch($relays, {
      getValue: (relay: Relay) => relay.url,
      fuseOptions: {
        keys: ["url", "name", {name: "description", weight: 0.3}],
      },
    }),
  )

  fetch = async (url: string): Promise<Maybe<Relay>> => {
    const httpUrl = url.replace(/^ws/, "http")

    try {
      // Don't auto-follow redirects, so a relay whose metadata document has moved
      // (301/302) is recorded via `redirect_to` rather than silently resolved.
      const res = await globalThis.fetch(httpUrl, {
        headers: {Accept: "application/nostr+json"},
        redirect: "manual",
      })

      if (res.status === 301 || res.status === 302) {
        const location = res.headers.get("location")

        if (location) {
          const relay = new Relay(url, {redirect_to: new URL(location, httpUrl).href})

          this.set(url, relay)

          return relay
        }

        return
      }

      const json = await res.json()

      if (json) {
        const relay = new Relay(url, json)

        this.set(url, relay)

        return relay
      }
    } catch (e) {
      // pass
    }
  }

  display = (url: string): Projection<string> =>
    this.project(url, $relay => $relay?.display() ?? displayRelayUrl(url))

  hasNegentropy = async (url: string) => (await this.load(url))?.hasNegentropy() ?? false

  hasNip = async (url: string, nip: number | string) => (await this.load(url))?.hasNip(nip) ?? false
}

// Items must expose their author (the event pubkey) so it can be checked
// against the relay's self pubkey. Domain readers satisfy this via `author()`.
export type RelaySignedItem = {author(): string}

/**
 * A `RelayScopedDerivedPlugin` that additionally validates provenance: an item
 * is only keyed on a relay when the relay ITSELF signed it — i.e. the event's
 * author matches the relay's NIP-11 `self` pubkey. This is the trust model for
 * relay-hosted, relay-signed content (NIP-29 group state, relay membership and
 * roles), and rejects events of these kinds forged by other pubkeys.
 *
 * Relay self pubkeys load from NIP-11 and can arrive after the events, so the
 * collection re-evaluates whenever the relay-profile collection changes.
 */
export abstract class RelaySignedDerivedPlugin<
  T extends RelaySignedItem,
> extends RelayScopedDerivedPlugin<T> {
  constructor(app: IApp, options: RelayScopedDerivedPluginOptions<T>) {
    super(app, {
      ...options,
      getKey: (item, url) =>
        item.author() === app.use(Relays).get(url)?.self ? options.getKey(item, url) : undefined,
      revalidateOn: app.use(Relays).index.$,
    })
  }
}
