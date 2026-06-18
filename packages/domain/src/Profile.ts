import {npubEncode} from "nostr-tools/nip19"
import {ellipsize, parseJson} from "@welshman/lib"
import {PROFILE, getLnUrl} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ProfileValues = {
  name?: string
  nip05?: string
  lud06?: string
  lud16?: string
  lnurl?: string
  about?: string
  banner?: string
  picture?: string
  website?: string
  display_name?: string
}

// Apply defaults, deriving `lnurl` from a `lud06` or `lud16` address.
export const makeProfileValues = (values: Partial<ProfileValues> = {}): ProfileValues => {
  const result: ProfileValues = {...values}

  for (const key of ["lud06", "lud16"] as const) {
    if (typeof result[key] === "string") {
      const lnurl = getLnUrl(result[key]!)

      if (lnurl) {
        result.lnurl = lnurl
      }
    }
  }

  return result
}

export const displayPubkey = (pubkey: string) => {
  const d = npubEncode(pubkey)

  return d.slice(0, 8) + "…" + d.slice(-5)
}

export class Profile extends DomainObject<ProfileValues> {
  readonly kind = PROFILE
  values = makeProfileValues()

  protected normalizeValues(values: Partial<ProfileValues> = {}) {
    return makeProfileValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ProfileValues> {
    return parseJson(event.content) || {}
  }

  name() {
    return this.values.name || this.values.display_name
  }

  nip05() {
    return this.values.
  }

  lnurl() {
    return this.values.
  }

  about() {
    return this.values.
  }

  banner() {
    return this.values.
  }

  picture() {
    return this.values.
  }

  website() {
    return this.values.
  }

  display(fallback = "") {
    const name = this.name()

    if (name) return ellipsize(name, 60).trim()
    if (this.event) return displayPubkey(this.event.pubkey).trim()

    return fallback.trim()
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      content: JSON.stringify(this.values),
      tags: this.event?.tags || [],
    }
  }
}
