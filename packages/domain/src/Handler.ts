import {parseJson} from "@welshman/lib"
import {HANDLER_INFORMATION, getKindTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

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
// tags. `plain` is the parsed metadata object.
export class Handler extends EventReader<HandlerMeta> {
  static kind = HANDLER_INFORMATION

  protected async parsePlain(): Promise<HandlerMeta> {
    return parseJson(this.event.content) || {}
  }

  protected reservedTagKeys() {
    return ["k"]
  }

  name() {
    return this.plain.name || (this.plain as {display_name?: string}).display_name
  }

  about() {
    return this.plain.about
  }

  image() {
    return this.plain.image || (this.plain as {picture?: string}).picture
  }

  website() {
    return this.plain.website
  }

  lud16() {
    return this.plain.lud16
  }

  nip05() {
    return this.plain.nip05
  }

  kinds() {
    return getKindTagValues(this.event.tags)
  }

  builder() {
    const builder = new HandlerBuilder()

    builder.name = this.name()
    builder.about = this.about()
    builder.image = this.image()
    builder.website = this.website()
    builder.lud16 = this.lud16()
    builder.nip05 = this.nip05()
    builder.kinds = this.kinds()

    return this.seedBuilder(builder)
  }
}

export class HandlerBuilder extends EventBuilder<HandlerMeta> {
  static kind = HANDLER_INFORMATION

  name?: string
  about?: string
  image?: string
  website?: string
  lud16?: string
  nip05?: string
  kinds: number[] = []

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
