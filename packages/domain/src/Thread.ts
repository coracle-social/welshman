import {THREAD, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ThreadValues = {
  title?: string
  content: string
}

export const makeThreadValues = (values: Partial<ThreadValues> = {}): ThreadValues => ({
  content: "",
  ...values,
})

// NIP-7D kind-11 forum thread root. The body lives in `content` as plain text
// (not JSON) and the title is carried in a "title" tag; room scoping is handled
// by the base `group` behavior tag. Non-addressable (referenced by event id);
// replies are COMMENT (kind 1111) via "#E". Flotilla also appends editor/inline
// tags at call sites; those round-trip via the base `extraTags` (with "title"
// declared reserved so it isn't double-counted).
export class Thread extends DomainObject<ThreadValues> {
  readonly kind = THREAD
  values = makeThreadValues()

  protected normalizeValues(values: Partial<ThreadValues> = {}) {
    return makeThreadValues(values)
  }

  protected reservedTagKeys() {
    return ["title"]
  }

  protected parseEvent(event: TrustedEvent): Partial<ThreadValues> {
    return {
      title: getTagValue("title", event.tags),
      content: event.content || "",
    }
  }

  title() {
    return this.values.title
  }

  content() {
    return this.values.content
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = []

    if (this.values.title) {
      tags.push(["title", this.values.title])
    }

    return {kind: this.kind, content: this.values.content, tags}
  }
}
