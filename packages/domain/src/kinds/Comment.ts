import {first} from "@welshman/lib"
import {COMMENT, Address, getTagValue, outbox} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {hint} from "../core/Hint.js"
import type {Tag} from "../core/Hint.js"
import {KindFactory} from "../core/Kind.js"
import type {AnyConfiguredKind} from "../core/Kind.js"

export type CommentRef = {
  id?: string
  address?: string
  kind?: string
  pubkey?: string
}

// NIP-22 kind-1111 comment (uppercase E/A/K/P tags = thread root, lowercase = immediate parent).
export class CommentReader extends EventReader {
  root(): CommentRef {
    return {
      id: getTagValue("E", this.event.tags),
      address: getTagValue("A", this.event.tags),
      kind: getTagValue("K", this.event.tags),
      pubkey: getTagValue("P", this.event.tags),
    }
  }

  parent(): CommentRef {
    return {
      id: getTagValue("e", this.event.tags),
      address: getTagValue("a", this.event.tags),
      kind: getTagValue("k", this.event.tags),
      pubkey: getTagValue("p", this.event.tags),
    }
  }
}

export class CommentWriter extends EventWriter<CommentReader> {
  rootTags: Tag[] = []
  parentTags: Tag[] = []

  constructor(def: AnyConfiguredKind, reader?: CommentReader) {
    super(def, reader)

    this.rootTags = this.consumeRefTags("E", "A", "K", "P")
    this.parentTags = this.consumeRefTags("e", "a", "k", "p")
  }

  private consumeRefTags(...keys: string[]) {
    const tags: Tag[] = []

    for (const key of keys) {
      const tag = first(this.consumeTags(key))

      if (tag) tags.push(tag)
    }

    return tags
  }

  setRoot(kind: number, id: string, pubkey: string, identifier?: string) {
    const h = hint(outbox(pubkey))

    this.rootTags = [
      ["K", String(kind)],
      ["E", id, h],
      ["P", pubkey, h],
    ]

    if (identifier) {
      this.rootTags.push(["A", new Address(kind, pubkey, identifier).toString(), h])
    }

    return this
  }

  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    const h = hint(outbox(pubkey))

    this.parentTags = [
      ["k", String(kind)],
      ["e", id, h],
      ["p", pubkey, h],
    ]

    if (identifier) {
      this.parentTags.push(["a", new Address(kind, pubkey, identifier).toString(), h])
    }

    return this
  }

  setRootFromEvent(event: TrustedEvent) {
    this.setRoot(event.kind, event.id, event.pubkey, getTagValue("d", event.tags))

    return this
  }

  setParentFromEvent(event: TrustedEvent) {
    this.setParent(event.kind, event.id, event.pubkey, getTagValue("d", event.tags))

    return this
  }

  protected buildTags() {
    return [...this.rootTags, ...this.parentTags]
  }
}

export const Comment = new KindFactory({
  kind: COMMENT,
  reader: CommentReader,
  writer: CommentWriter,
})
