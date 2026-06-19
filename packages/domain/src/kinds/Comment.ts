import {first} from "@welshman/lib"
import {COMMENT, Address, getAddress, getTagValue, isReplaceableKind} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// A NIP-22 reference to another event: its id, address (for addressable roots),
// kind, and pubkey. All optional since a comment may reference any subset.
export type CommentRef = {
  id?: string
  address?: string
  kind?: string
  pubkey?: string
}

// Build a reference from a full event, deriving the address only when the event
// is addressable/replaceable.
const refFromEvent = (event: TrustedEvent): CommentRef => ({
  id: event.id,
  pubkey: event.pubkey,
  kind: String(event.kind),
  address: isReplaceableKind(event.kind) ? getAddress(event) : undefined,
})

// Build the NIP-22 reference tags for one struct: pass uppercase keys for the
// root, lowercase for the parent.
const refTags = (ref: CommentRef, [idKey, addressKey, kindKey, pubkeyKey]: string[]) => {
  const tags: string[][] = []

  if (ref.id) tags.push([idKey, ref.id])
  if (ref.address) tags.push([addressKey, ref.address])
  if (ref.kind) tags.push([kindKey, ref.kind])
  if (ref.pubkey) tags.push([pubkeyKey, ref.pubkey])

  return tags
}

// Read side of NIP-22 kind-1111 generic comment, flotilla's universal reply
// primitive: threads, goals, and polls reference their root event via uppercase
// E/A/K/P tags, while classifieds and calendar events reference addressable
// roots via #A. Uppercase tags (E/A/K/P) name the root of the thread; lowercase
// tags (e/a/k/p) name the immediate parent. The comment body is plain text in
// the event content (not JSON).
//
// The reference tags are read lazily into the root/parent accessors; any other
// tags round-trip via the base extraTags.
export class Comment extends EventReader {
  readonly kind = COMMENT

  content() {
    return this.event.content || ""
  }

  rootId() {
    return getTagValue("E", this.event.tags)
  }

  rootAddress() {
    return getTagValue("A", this.event.tags)
  }

  rootKind() {
    return getTagValue("K", this.event.tags)
  }

  rootPubkey() {
    return getTagValue("P", this.event.tags)
  }

  parentId() {
    return getTagValue("e", this.event.tags)
  }

  parentAddress() {
    return getTagValue("a", this.event.tags)
  }

  parentKind() {
    return getTagValue("k", this.event.tags)
  }

  parentPubkey() {
    return getTagValue("p", this.event.tags)
  }

  root(): CommentRef {
    return {
      id: this.rootId(),
      address: this.rootAddress(),
      kind: this.rootKind(),
      pubkey: this.rootPubkey(),
    }
  }

  parent(): CommentRef {
    return {
      id: this.parentId(),
      address: this.parentAddress(),
      kind: this.parentKind(),
      pubkey: this.parentPubkey(),
    }
  }

  builder() {
    return new CommentBuilder(this)
  }
}

// Write side of NIP-22 kind-1111 generic comment. Set the body via setContent and
// the root/parent references via setRoot/setParent (or the *FromEvent variants);
// buildTags rebuilds the uppercase/lowercase reference tags from those structs.
export class CommentBuilder extends EventBuilder<Comment> {
  readonly kind = COMMENT

  content = ""
  root: CommentRef = {}
  parent: CommentRef = {}

  constructor(readonly reader?: Comment) {
    super(reader)

    // Consume the represented reference tags out of the carried-over extraTags so
    // they round-trip through the root/parent structs below rather than being
    // emitted twice (once from buildTags, once from the base's extraTags
    // pass-through). Uppercase keys name the root, lowercase the parent.
    const rootId = first(this.consumeTags("E"))
    const rootAddress = first(this.consumeTags("A"))
    const rootKind = first(this.consumeTags("K"))
    const rootPubkey = first(this.consumeTags("P"))
    const parentId = first(this.consumeTags("e"))
    const parentAddress = first(this.consumeTags("a"))
    const parentKind = first(this.consumeTags("k"))
    const parentPubkey = first(this.consumeTags("p"))

    this.content = reader?.event.content ?? ""
    this.root = {
      id: rootId?.[1],
      address: rootAddress?.[1],
      kind: rootKind?.[1],
      pubkey: rootPubkey?.[1],
    }
    this.parent = {
      id: parentId?.[1],
      address: parentAddress?.[1],
      kind: parentKind?.[1],
      pubkey: parentPubkey?.[1],
    }
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  // Set the thread root reference, deriving the address from kind/pubkey/identifier
  // when the referenced event is addressable.
  setRoot(kind: number, id: string, pubkey: string, identifier?: string) {
    this.root = {
      id,
      pubkey,
      kind: String(kind),
      address: identifier == null ? undefined : new Address(kind, pubkey, identifier).toString(),
    }

    return this
  }

  // Set the immediate parent reference, deriving the address as above.
  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    this.parent = {
      id,
      pubkey,
      kind: String(kind),
      address: identifier == null ? undefined : new Address(kind, pubkey, identifier).toString(),
    }

    return this
  }

  // Set the thread root reference from a full event.
  setRootFromEvent(event: TrustedEvent) {
    this.root = refFromEvent(event)

    return this
  }

  // Set the immediate parent reference from a full event.
  setParentFromEvent(event: TrustedEvent) {
    this.parent = refFromEvent(event)

    return this
  }

  protected buildContent(_signer?: ISigner) {
    return this.content
  }

  protected buildTags() {
    return [
      ...refTags(this.root, ["E", "A", "K", "P"]),
      ...refTags(this.parent, ["e", "a", "k", "p"]),
    ]
  }
}
