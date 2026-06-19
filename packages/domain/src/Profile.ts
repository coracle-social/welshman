import {npubEncode} from "nostr-tools/nip19"
import {ellipsize, parseJson} from "@welshman/lib"
import {PROFILE, getLnUrl} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

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

// Read side for a NIP-01 kind-0 profile. The metadata lives in the JSON content,
// parsed once into `plain` (a ProfileValues with `lnurl` derived from lud06/lud16).
// Accessors read `this.plain`; there are no represented tags.
export class Profile extends EventReader<ProfileValues> {
  static kind = PROFILE

  protected parsePlain() {
    return makeProfileValues(parseJson(this.event.content) || {})
  }

  name() {
    return this.plain.name || this.plain.display_name
  }

  nip05() {
    return this.plain.nip05
  }

  lnurl() {
    return this.plain.lnurl
  }

  about() {
    return this.plain.about
  }

  banner() {
    return this.plain.banner
  }

  picture() {
    return this.plain.picture
  }

  website() {
    return this.plain.website
  }

  display(fallback = "") {
    const name = this.name()

    if (name) return ellipsize(name, 60).trim()

    return displayPubkey(this.event.pubkey).trim() || fallback.trim()
  }

  builder() {
    const builder = new ProfileBuilder()

    builder.values = makeProfileValues(this.plain)

    return this.seedBuilder(builder)
  }
}

// Write side for a NIP-01 kind-0 profile. Holds the profile fields and serializes
// them to JSON content; emits no profile-specific tags.
export class ProfileBuilder extends EventBuilder<ProfileValues> {
  static kind = PROFILE

  values: ProfileValues = makeProfileValues()

  setValues(values: Partial<ProfileValues>) {
    this.values = makeProfileValues(values)

    return this
  }

  setName(name: string) {
    this.values = makeProfileValues({...this.values, name})

    return this
  }

  setNip05(nip05: string) {
    this.values = makeProfileValues({...this.values, nip05})

    return this
  }

  setAbout(about: string) {
    this.values = makeProfileValues({...this.values, about})

    return this
  }

  setBanner(banner: string) {
    this.values = makeProfileValues({...this.values, banner})

    return this
  }

  setPicture(picture: string) {
    this.values = makeProfileValues({...this.values, picture})

    return this
  }

  setWebsite(website: string) {
    this.values = makeProfileValues({...this.values, website})

    return this
  }

  protected buildTags() {
    return []
  }

  protected buildContent(_signer?: ISigner) {
    return JSON.stringify(this.values)
  }
}
