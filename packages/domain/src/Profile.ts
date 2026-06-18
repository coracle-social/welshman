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

/**
 * Normalize raw profile values, deriving `lnurl` from a `lud06` or `lud16`
 * address when present.
 */
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

/**
 * A kind-0 profile. Profile data lives unencrypted in the event content as
 * JSON, so this is the simplest kind of domain object — `getTemplate` ignores
 * the signer and only `toEvent`/`toRumor` need one (to sign).
 *
 * @example
 * const profile = Profile.parse(event)
 * profile.set({about: "hello"})
 * const signed = await profile.toEvent(signer)
 */
export class Profile extends DomainObject {
  readonly kind = PROFILE
  readonly event?: TrustedEvent

  values: ProfileValues

  constructor(values: Partial<ProfileValues> = {}, event?: TrustedEvent) {
    super()

    this.values = makeProfileValues(values)
    this.event = event
  }

  static make(values: Partial<ProfileValues> = {}) {
    return new Profile(values)
  }

  /** Parse a kind-0 event into a `Profile`. Throws on the wrong kind. */
  static parse(event: TrustedEvent) {
    if (event.kind !== PROFILE) {
      throw new Error(`Expected a kind ${PROFILE} event, got kind ${event.kind}`)
    }

    return new Profile(parseJson(event.content) || {}, event)
  }

  /** Merge `updates` into the profile values, re-deriving `lnurl` as needed. */
  set(updates: Partial<ProfileValues>) {
    this.values = makeProfileValues({...this.values, ...updates})

    return this
  }

  /** Whether the profile has a display-worthy name. */
  hasName() {
    return Boolean(this.values.name || this.values.display_name)
  }

  /** A human-readable label, falling back to a shortened npub, then `fallback`. */
  display(fallback = "") {
    const {name, display_name} = this.values

    if (name) return ellipsize(name, 60).trim()
    if (display_name) return ellipsize(display_name, 60).trim()
    if (this.event) return displayPubkey(this.event.pubkey).trim()

    return fallback.trim()
  }

  async getTemplate(): Promise<EventTemplate> {
    return {
      kind: PROFILE,
      content: JSON.stringify(this.values),
      // Preserve any tags from the source event (e.g. nip05/relay hints).
      tags: this.event?.tags || [],
    }
  }

  toJSON() {
    return {...this.values}
  }
}
