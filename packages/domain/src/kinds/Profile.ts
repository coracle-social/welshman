import {npubEncode} from "nostr-tools/nip19"
import {ellipsize, isPojo, parseJson} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {PROFILE, getLnUrl} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

export const parseLnUrl = (values: Record<string, any> = {}): Maybe<string> => {
  for (const key of ["lud06", "lud16"] as const) {
    if (typeof values[key] === "string") {
      const lnurl = getLnUrl(values[key]!)

      if (lnurl) {
        return lnurl
      }
    }
  }
}

export const displayPubkey = (pubkey: string) => {
  const d = npubEncode(pubkey)

  return d.slice(0, 8) + "…" + d.slice(-5)
}

// Read side for a NIP-01 kind-0 profile. The metadata lives in the JSON content,
// parsed once into `values` (with `lnurl` derived from lud06/lud16). Accessors
// read `this.values`; there are no represented tags.
export class Profile extends EventReader {
  readonly kind = PROFILE
  readonly values: Record<string, any> = {}

  protected async parse(signer?: ISigner) {
    const json = parseJson(this.event.content)

    if (isPojo(json)) {
      Object.assign(this.values, json)
    }
  }

  name(): Maybe<string> {
    return this.values.name || this.values.display_name
  }

  nip05(): Maybe<string> {
    return this.values.nip05
  }

  lnurl(): Maybe<string> {
    return parseLnUrl(this.values)
  }

  about(): Maybe<string> {
    return this.values.about
  }

  banner(): Maybe<string> {
    return this.values.banner
  }

  picture(): Maybe<string> {
    return this.values.picture
  }

  website(): Maybe<string> {
    return this.values.website
  }

  display(fallback = "") {
    const name = this.name()

    if (name) return ellipsize(name, 60).trim()

    return displayPubkey(this.event.pubkey).trim() || fallback.trim()
  }

  builder() {
    return new ProfileBuilder(this)
  }
}

export class ProfileBuilder extends EventBuilder<Profile> {
  readonly kind = PROFILE
  values: Record<string, any>

  constructor(readonly reader?: Profile) {
    super(reader)
    this.values = {...(reader?.values ?? {})}
  }

  name(name: string) {
    this.values.name = name

    return this
  }

  nip05(nip05: string) {
    this.values.nip05 = nip05

    return this
  }

  about(about: string) {
    this.values.about = about

    return this
  }

  banner(banner: string) {
    this.values.banner = banner

    return this
  }

  picture(picture: string) {
    this.values.picture = picture

    return this
  }

  website(website: string) {
    this.values.website = website

    return this
  }

  protected buildTags() {
    return []
  }

  protected buildContent(_signer?: ISigner) {
    return JSON.stringify(this.values)
  }
}
