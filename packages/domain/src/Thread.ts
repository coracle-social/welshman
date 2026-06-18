import {THREAD, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type ThreadValues = {
  title?: string
  content: string
  h?: string
}

export const makeThreadValues = (values: Partial<ThreadValues> = {}): ThreadValues => ({
  content: "",
  ...values,
})

// NIP-7D kind-11 forum thread root. The body lives in `content` as plain text
// (not JSON), the title is carried in a "title" tag, and an optional "h" tag
// scopes the thread to a room. Non-addressable (referenced by event id);
// replies are COMMENT (kind 1111) via "#E". Flotilla also appends editor/inline
// tags and an optional PROTECTED ("-") tag at call sites, so on serialize we
// preserve any non-title/non-h tags from the parsed event to keep round-tripping
// lossless for those extra tags.
export class Thread extends DomainObject<ThreadValues> {
  readonly kind = THREAD
  values = makeThreadValues()

  protected normalizeValues(values: Partial<ThreadValues> = {}) {
    return makeThreadValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<ThreadValues> {
    return {
      title: getTagValue("title", event.tags),
      content: event.content || "",
      h: getTagValue("h", event.tags),
    }
  }

  title() {
    return this.values.title
  }

  content() {
    return this.values.content
  }

  h() {
    return this.values.h
  }

  room() {
    return this.values.h
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = (this.event?.tags || []).filter(
      t => t[0] !== "title" && t[0] !== "h",
    )

    if (this.values.title) {
      tags.push(["title", this.values.title])
    }

    if (this.values.h) {
      tags.push(["h", this.values.h])
    }

    return {kind: this.kind, content: this.values.content, tags}
  }
}
