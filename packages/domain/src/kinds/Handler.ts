import {isPojo, parseJson} from "@welshman/lib"
import {HANDLER_INFORMATION, kindTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

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
  readonly values: HandlerMeta = {}

  parse() {
    const json = parseJson(this.event.content)

    if (isPojo(json)) {
      Object.assign(this.values, json)
    }

    return this
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
    return tagValues(kindTags("k"), this.event.tags)
  }
}

export class HandlerWriter extends EventWriter<HandlerReader> {
  values: HandlerMeta = {}
  kindTags: string[][] = []

  constructor(kind: number, context: KindContext, reader?: HandlerReader) {
    super(kind, context, reader)

    const parser = new TagParser(this.extraTags)

    this.values = {...(reader?.values ?? {})}
    this.kindTags = parser.consume("k")
    this.extraTags = parser.tags
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

  renderContent() {
    return JSON.stringify(this.values)
  }

  protected renderDomainTags() {
    return this.kindTags
  }
}

export class HandlerQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const Handler = new KindFactory({
  kind: HANDLER_INFORMATION,
  reader: HandlerReader,
  writer: HandlerWriter,
  query: HandlerQuery,
})
