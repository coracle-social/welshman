import {isPojo, parseJson} from "@welshman/lib"
import {HANDLER_INFORMATION, getKindTagValues} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"
import type {AnyKind} from "../Kind.js"

export type HandlerMeta = {
  name?: string
  about?: string
  picture?: string
  website?: string
  lud16?: string
  nip05?: string
}

// NIP-89 kind-31990 handler information.
export class HandlerReader extends EventReader {
  readonly kind = HANDLER_INFORMATION
  readonly values: HandlerMeta = {}

  async parse(signer?: ISigner) {
    const json = parseJson(this.event.content)

    if (isPojo(json)) {
      Object.assign(this.values, json)
    }
  }

  name() {
    return this.values.name
  }

  about() {
    return this.values.about
  }

  picture() {
    return this.values.picture
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
}

export class HandlerBuilder extends EventBuilder<HandlerReader> {
  readonly kind = HANDLER_INFORMATION

  values: HandlerMeta = {}
  kindTags: string[][] = []

  constructor(def: AnyKind, reader?: HandlerReader) {
    super(def, reader)

    this.values = {...(reader?.values ?? {})}
    this.kindTags = this.consumeTags("k")
  }

  setName(name: string) {
    this.values.name = name

    return this
  }

  setAbout(about: string) {
    this.values.about = about

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

  setLud16(lud16: string) {
    this.values.lud16 = lud16

    return this
  }

  setNip05(nip05: string) {
    this.values.nip05 = nip05

    return this
  }

  setKinds(kinds: number[]) {
    this.kindTags = kinds.map(kind => ["k", String(kind)])

    return this
  }

  protected buildContent() {
    return JSON.stringify(this.values)
  }

  protected buildTags() {
    return this.kindTags
  }
}

export const Handler = new Kind({
  reader: HandlerReader,
  builder: HandlerBuilder,
  router: OutboxRouter,
})
