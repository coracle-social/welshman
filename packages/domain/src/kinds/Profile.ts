import {npubEncode} from "nostr-tools/nip19"
import {ellipsize, isPojo, parseJson} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {PROFILE, getLnUrl} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {AnyConfiguredKind} from "../core/Kind.js"

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

// NIP-01 kind-0 profile metadata.
export class ProfileReader extends EventReader {
  readonly values: Record<string, any> = {}

  async parse() {
    const json = parseJson(this.event.content)

    if (isPojo(json)) {
      Object.assign(this.values, json)
    }
  }

  name(): Maybe<string> {
    return this.values.name
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
}

export class ProfileWriter extends EventWriter<ProfileReader> {
  values: Record<string, any>

  constructor(def: AnyConfiguredKind, reader?: ProfileReader) {
    super(def, reader)
    this.values = {...(reader?.values ?? {})}
  }

  update(values: Record<string, any>) {
    Object.assign(this.values, values)

    return this
  }

  setName(name: string) {
    this.values.name = name

    return this
  }

  setNip05(nip05: string) {
    this.values.nip05 = nip05

    return this
  }

  setAbout(about: string) {
    this.values.about = about

    return this
  }

  setBanner(banner: string) {
    this.values.banner = banner

    return this
  }

  setPicture(picture: string) {
    this.values.picture = picture

    return this
  }

  setWebsite(website: string) {
    this.values.website = website

    return this
  }

  protected buildTags() {
    return []
  }

  protected buildContent() {
    return JSON.stringify(this.values)
  }
}

export const Profile = new KindFactory({
  kind: PROFILE,
  reader: ProfileReader,
  writer: ProfileWriter,
})
