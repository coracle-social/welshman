import {COMMENT, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type CommentValues = {
  content: string
  rootId?: string
  rootAddress?: string
  rootKind?: string
  rootPubkey?: string
  parentId?: string
  parentAddress?: string
  parentKind?: string
  tags: string[][]
}

export const makeCommentValues = (values: Partial<CommentValues> = {}): CommentValues => ({
  content: "",
  tags: [],
  ...values,
})

// NIP-22 kind-1111 generic comment, flotilla's universal reply primitive: threads,
// goals, and polls reference their root event via uppercase E/A/K/P tags, while
// classifieds and calendar events reference addressable roots via #A. Uppercase
// tags (E/A/K/P) name the root of the thread; lowercase tags (e/a/k) name the
// immediate parent. The comment body lives in `content` as plain text (not JSON).
//
// Flotilla builds the reference tags at call sites via @welshman/app's
// `tagEventForComment(event, url)`, so this class round-trips the raw `tags`
// rather than reconstructing them.
export class Comment extends DomainObject<CommentValues> {
  readonly kind = COMMENT
  values = makeCommentValues()

  protected normalizeValues(values: Partial<CommentValues> = {}) {
    return makeCommentValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<CommentValues> {
    return {
      content: event.content || "",
      rootId: getTagValue("E", event.tags),
      rootAddress: getTagValue("A", event.tags),
      rootKind: getTagValue("K", event.tags),
      rootPubkey: getTagValue("P", event.tags),
      parentId: getTagValue("e", event.tags),
      parentAddress: getTagValue("a", event.tags),
      parentKind: getTagValue("k", event.tags),
      tags: event.tags,
    }
  }

  content() {
    return this.values.content
  }

  rootId() {
    return this.values.rootId
  }

  rootAddress() {
    return this.values.rootAddress
  }

  rootKind() {
    return this.values.rootKind
  }

  rootPubkey() {
    return this.values.rootPubkey
  }

  parentId() {
    return this.values.parentId
  }

  parentAddress() {
    return this.values.parentAddress
  }

  parentKind() {
    return this.values.parentKind
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      content: this.values.content,
      tags: this.values.tags,
    }
  }
}
