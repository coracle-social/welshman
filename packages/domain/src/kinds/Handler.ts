import {isPojo, parseJson} from "@welshman/lib"
import {HANDLER_INFORMATION, getKindTagValues} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// The parsed JSON metadata blob stored in a handler's content. Shaped like a
// profile; readers map the various aliases (display_name/picture) down to a
// single canonical accessor.
export type HandlerMeta = {
  name?: string
  about?: string
  image?: string
  website?: string
  lud16?: string
  nip05?: string
}

// NIP-89 kind-31990 handler information. Addressable (has a `d` tag); content is a
// JSON metadata blob like a profile, and the handled `kinds` are stored as `k`
// tags. `values` is the parsed metadata object.
export class Handler extends EventReader {
  readonly kind = HANDLER_INFORMATION
  readonly values: HandlerMeta = {}

  protected async parse(signer?: ISigner) {
    const json = parseJson(this.event.content)

    if (isPojo(json)) {
      Object.assign(this.values, json)
    }
  }

  name() {
    return this.values.name || (this.values as {display_name?: string}).display_name
  }

  about() {
    return this.values.about
  }

  image() {
    return this.values.image || (this.values as {picture?: string}).picture
  }

  website() {
    return this.values.website
  }

  lud16() {
    return this.values.lud16
  }

  nip05() {
    return this.values.nip05
  }

  kinds() {
    return getKindTagValues(this.event.tags)
  }

  builder() {
    return new HandlerBuilder(this)
  }
}

export class HandlerBuilder extends EventBuilder<Handler> {
  readonly kind = HANDLER_INFORMATION

  name?: string
  about?: string
  image?: string
  website?: string
  lud16?: string
  nip05?: string
  kinds: number[] = []

  constructor(readonly reader?: Handler) {
    super(reader)

    this.name = reader?.name()
    this.about = reader?.about()
    this.image = reader?.image()
    this.website = reader?.website()
    this.lud16 = reader?.lud16()
    this.nip05 = reader?.nip05()
    this.kinds = this.consumeTags("k").map(t => Number(t[1]))
  }

  setName(name: string) {
    this.name = name

    return this
  }

  setAbout(about: string) {
    this.about = about

    return this
  }

  setImage(image: string) {
    this.image = image

    return this
  }

  setWebsite(website: string) {
    this.website = website

    return this
  }

  setLud16(lud16: string) {
    this.lud16 = lud16

    return this
  }

  setNip05(nip05: string) {
    this.nip05 = nip05

    return this
  }

  setKinds(kinds: number[]) {
    this.kinds = kinds

    return this
  }

  protected buildContent() {
    const {name, about, image, website, lud16, nip05} = this

    return JSON.stringify({name, about, image, website, lud16, nip05})
  }

  protected buildTags() {
    return this.kinds.map(kind => ["k", String(kind)])
  }
}
