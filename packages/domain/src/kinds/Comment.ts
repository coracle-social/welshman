import {first} from "@welshman/lib"
import {COMMENT, Address, getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

export type CommentRef = {
  id?: string
  address?: string
  kind?: string
  pubkey?: string
}

// NIP-22 kind-1111 comment (uppercase E/A/K/P tags = thread root, lowercase = immediate parent).
export class Comment extends EventReader {
  readonly kind = COMMENT

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

  builder() {
    return new CommentBuilder(this)
  }
}

export class CommentBuilder extends EventBuilder<Comment> {
  readonly kind = COMMENT

  rootTags: string[][] = []
  parentTags: string[][] = []

  constructor(readonly reader?: Comment) {
    super(reader)

    this.rootTags = this.consumeRefTags("E", "A", "K", "P")
    this.parentTags = this.consumeRefTags("e", "a", "k", "p")
  }

  private consumeRefTags(...keys: string[]) {
    const tags: string[][] = []

    for (const key of keys) {
      const tag = first(this.consumeTags(key))

      if (tag) tags.push(tag)
    }

    return tags
  }

  setRoot(kind: number, id: string, pubkey: string, identifier?: string) {
    this.rootTags = [
      ["K", String(kind)],
      ["E", id],
      ["P", pubkey],
    ]

    if (identifier) {
      this.rootTags.push(["A", new Address(kind, pubkey, identifier).toString()])
    }

    return this
  }

  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    this.parentTags = [
      ["k", String(kind)],
      ["e", id],
      ["p", pubkey],
    ]

    if (identifier) {
      this.parentTags.push(["a", new Address(kind, pubkey, identifier).toString()])
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
