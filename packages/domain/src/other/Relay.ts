import {displayRelayUrl} from "@welshman/util"

// A NIP-11 relay information document, keyed by url. Like `Zapper`, these aren't
// nostr events — they're fetched over HTTP from each relay — so `Relay` is a
// plain domain object rather than a reader/writer pair. `RelayInfo` is the raw
// (untrusted) json a relay serves; `Relay` normalizes it.
export type RelayInfo = {
  icon?: string
  banner?: string
  name?: string
  self?: string
  pubkey?: string
  contact?: string
  software?: string
  version?: string
  negentropy?: number
  description?: string
  supported_nips?: string[]
  privacy_policy?: string
  terms_of_service?: string
  limitation?: {
    min_pow_difficulty?: number
    payment_required?: boolean
    auth_required?: boolean
  }
  // Not part of NIP-11 — set by the loader when the metadata document responds
  // with a 301/302 redirect. Holds the url the document points to.
  redirect_to?: string
}

export class Relay {
  url!: string
  icon?: string
  banner?: string
  name?: string
  self?: string
  pubkey?: string
  contact?: string
  software?: string
  version?: string
  negentropy?: number
  description?: string
  supported_nips?: string[]
  privacy_policy?: string
  terms_of_service?: string
  limitation?: {
    min_pow_difficulty?: number
    payment_required?: boolean
    auth_required?: boolean
  }
  redirect_to?: string

  constructor(url: string, json: RelayInfo = {}) {
    // Copy every field, including any non-standard NIP-11 ones, but force the url
    // and coerce supported_nips (untrusted json) to a string array.
    Object.assign(this, json, {
      url,
      supported_nips: Array.isArray(json.supported_nips) ? json.supported_nips.map(String) : [],
    })
  }

  // This relay's url reduced to its host/path for display, e.g. "relay.example".
  displayUrl() {
    return displayRelayUrl(this.url)
  }

  // This relay's display name, falling back to its display url (or `fallback`).
  display(fallback = this.displayUrl()) {
    return this.name || fallback
  }

  // Whether this relay supports negentropy sync (NIP-77).
  hasNegentropy() {
    if (this.negentropy) return true
    if (this.supported_nips?.includes("77")) return true
    if (this.software?.includes?.("strfry") && !this.version?.match(/^0\./)) return true

    return false
  }

  // Whether this relay advertises support for the given NIP.
  hasNip(nip: number | string) {
    return this.supported_nips?.includes(String(nip)) ?? false
  }
}
