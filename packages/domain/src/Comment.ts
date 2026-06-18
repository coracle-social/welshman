import {COMMENT, Address, getAddress, getTagValue, isReplaceableKind} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

// A NIP-22 reference to another event: its id, address (for addressable roots),
// kind, and pubkey. All optional since a comment may reference any subset.
export type CommentRef = {
  id?: string
  address?: string
  kind?: string
  pubkey?: string
}

// The tag keys NIP-22 uses for the root (uppercase) and parent (lowercase)
// references; stripped on parse and rebuilt from the structs on serialize.
const REF_TAG_KEYS = ["E", "A", "K", "P", "e", "a", "k", "p"]

// Build a reference from a full event, deriving the address only when the event
// is addressable/replaceable.
const refFromEvent = (event: TrustedEvent): CommentRef => ({
  id: event.id,
  pubkey: event.pubkey,
  kind: String(event.kind),
  address: isReplaceableKind(event.kind) ? getAddress(event) : undefined,
})

export type CommentValues = {
  content: string
  root: CommentRef
  parent: CommentRef
}

export const makeCommentValues = (values: Partial<CommentValues> = {}): CommentValues => ({
  content: "",
  root: {},
  parent: {},
  ...values,
})

// NIP-22 kind-1111 generic comment, flotilla's universal reply primitive: threads,
// goals, and polls reference their root event via uppercase E/A/K/P tags, while
// classifieds and calendar events reference addressable roots via #A. Uppercase
// tags (E/A/K/P) name the root of the thread; lowercase tags (e/a/k/p) name the
// immediate parent. The comment body lives in `content` as plain text (not JSON).
//
// The reference tags are parsed into the `root`/`parent` structs and rebuilt
// from them in toTemplate; any other tags round-trip via the base `extraTags`
// (REF_TAG_KEYS is declared as reserved so they aren't double-counted). Use
// setRoot/setParent (or the *FromEvent variants) to populate them programmatically.
export class Comment extends DomainObject<CommentValues> {
  readonly kind = COMMENT
  values = makeCommentValues()

  protected normalizeValues(values: Partial<CommentValues> = {}) {
    return makeCommentValues(values)
  }

  protected reservedTagKeys() {
    return REF_TAG_KEYS
  }

  protected parseEvent(event: TrustedEvent): Partial<CommentValues> {
    return {
      content: event.content || "",
      root: {
        id: getTagValue("E", event.tags),
        address: getTagValue("A", event.tags),
        kind: getTagValue("K", event.tags),
        pubkey: getTagValue("P", event.tags),
      },
      parent: {
        id: getTagValue("e", event.tags),
        address: getTagValue("a", event.tags),
        kind: getTagValue("k", event.tags),
        pubkey: getTagValue("p", event.tags),
      },
    }
  }

  content() {
    return this.values.content
  }

  rootId() {
    return this.values.root.id
  }

  rootAddress() {
    return this.values.root.address
  }

  rootKind() {
    return this.values.root.kind
  }

  rootPubkey() {
    return this.values.root.pubkey
  }

  parentId() {
    return this.values.parent.id
  }

  parentAddress() {
    return this.values.parent.address
  }

  parentKind() {
    return this.values.parent.kind
  }

  parentPubkey() {
    return this.values.parent.pubkey
  }

  // Set the thread root reference, deriving the address from kind/pubkey/identifier
  // when the referenced event is addressable.
  setRoot(kind: number, id: string, pubkey: string, identifier?: string) {
    this.values.root = {
      id,
      pubkey,
      kind: String(kind),
      address: identifier == null ? undefined : new Address(kind, pubkey, identifier).toString(),
    }

    return this
  }

  // Set the immediate parent reference, deriving the address as above.
  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    this.values.parent = {
      id,
      pubkey,
      kind: String(kind),
      address: identifier == null ? undefined : new Address(kind, pubkey, identifier).toString(),
    }

    return this
  }

  // Set the thread root reference from a full event.
  setRootFromEvent(event: TrustedEvent) {
    this.values.root = refFromEvent(event)

    return this
  }

  // Set the immediate parent reference from a full event.
  setParentFromEvent(event: TrustedEvent) {
    this.values.parent = refFromEvent(event)

    return this
  }

  // Build the NIP-22 reference tags for one struct: uppercase keys for the root,
  // lowercase for the parent.
  private refTags(ref: CommentRef, [idKey, addressKey, kindKey, pubkeyKey]: string[]) {
    const tags: string[][] = []

    if (ref.id) tags.push([idKey, ref.id])
    if (ref.address) tags.push([addressKey, ref.address])
    if (ref.kind) tags.push([kindKey, ref.kind])
    if (ref.pubkey) tags.push([pubkeyKey, ref.pubkey])

    return tags
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      content: this.values.content,
      tags: [
        ...this.refTags(this.values.root, ["E", "A", "K", "P"]),
        ...this.refTags(this.values.parent, ["e", "a", "k", "p"]),
      ],
    }
  }
}
