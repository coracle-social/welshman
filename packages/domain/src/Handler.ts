import {parseJson} from "@welshman/lib"
import {HANDLER_INFORMATION, getKindTagValues, getIdentifier, getAddress} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type HandlerValues = {
  name?: string
  about?: string
  image?: string
  website?: string
  lud16?: string
  nip05?: string
  kinds: number[]
}

export const makeHandlerValues = (values: Partial<HandlerValues> = {}): HandlerValues => ({
  kinds: [],
  ...values,
})

// NIP-89 kind-31990 handler information. Addressable (has a `d` tag); content is a
// JSON metadata blob like a profile. Holds one object with the full set of handled
// `kinds`, rather than the legacy per-kind fan-out.
export class Handler extends DomainObject<HandlerValues> {
  readonly kind = HANDLER_INFORMATION
  values = makeHandlerValues()

  protected normalizeValues(values: Partial<HandlerValues> = {}) {
    return makeHandlerValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<HandlerValues> {
    const meta = parseJson(event.content) || {}

    return {
      name: meta.name || meta.display_name,
      about: meta.about,
      image: meta.image || meta.picture,
      website: meta.website,
      lud16: meta.lud16,
      nip05: meta.nip05,
      kinds: getKindTagValues(event.tags),
    }
  }

  name() {
    return this.values.name
  }

  about() {
    return this.values.about
  }

  image() {
    return this.values.image
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
    return this.values.kinds
  }

  supportsKind(kind: number) {
    return this.values.kinds.includes(kind)
  }

  identifier() {
    return getIdentifier(this.event!)
  }

  display(fallback = "") {
    return this.name() || fallback
  }

  getAddress() {
    return getAddress(this.event!)
  }

  async toTemplate(): Promise<EventTemplate> {
    const {name, about, image, website, lud16, nip05} = this.values

    const content = JSON.stringify({name, about, image, website, lud16, nip05})

    // Rebuild `k` tags from values.kinds, preserving existing `d`/`a` tags.
    const preservedTags = (this.event?.tags || []).filter(t => t[0] === "d" || t[0] === "a")
    const kindTags = this.values.kinds.map(kind => ["k", String(kind)])

    return {
      kind: this.kind,
      content,
      tags: [...preservedTags, ...kindTags],
    }
  }
}
