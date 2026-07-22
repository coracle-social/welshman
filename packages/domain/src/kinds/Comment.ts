import {first, mapVals, nth} from "@welshman/lib"
import {COMMENT, Address, tagSpec, tagValue, outbox} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-22 comment reference tags: uppercase (A/E/P/K) point at the thread root,
// lowercase (a/e/p/k) at the immediate parent.
export const getCommentTags = (tags: string[][]) => {
  const roots = tags.filter(t => ["A", "E", "P", "K"].includes(t[0]))
  const replies = tags.filter(t => ["a", "e", "p", "k"].includes(t[0]))

  return {roots, replies}
}

export const getCommentTagValues = (tags: string[][]) =>
  mapVals(
    tags => tags.filter(t => ["a", "e"].includes(t[0].toLowerCase())).map(nth(1)),
    getCommentTags(tags),
  )

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
      id: tagValue(tagSpec("E"), this.event.tags),
      address: tagValue(tagSpec("A"), this.event.tags),
      kind: tagValue(tagSpec("K"), this.event.tags),
      pubkey: tagValue(tagSpec("P"), this.event.tags),
    }
  }

  parent(): CommentRef {
    return {
      id: tagValue(tagSpec("e"), this.event.tags),
      address: tagValue(tagSpec("a"), this.event.tags),
      kind: tagValue(tagSpec("k"), this.event.tags),
      pubkey: tagValue(tagSpec("p"), this.event.tags),
    }
  }
}

export class CommentWriter extends EventWriter<CommentReader> {
  rootTags: string[][] = []
  parentTags: string[][] = []

  constructor(kind: number, context: KindContext, reader?: CommentReader) {
    super(kind, context, reader)

    if (reader) {
      const parser = new TagParser(this.extraTags)

      this.rootTags = this.consumeRefTags(parser, "E", "A", "K", "P")
      this.parentTags = this.consumeRefTags(parser, "e", "a", "k", "p")
      this.extraTags = parser.tags
    }
  }

  private consumeRefTags(parser: TagParser, ...keys: string[]) {
    const tags: string[][] = []

    for (const key of keys) {
      const tag = first(parser.consume(key))

      if (tag) tags.push(tag)
    }

    return tags
  }

  setRoot(kind: number, id: string, pubkey: string, identifier?: string) {
    const tags = [
      ["K", String(kind)],
      ["E", id],
      ["P", pubkey],
    ]

    if (identifier) {
      tags.push(["A", new Address(kind, pubkey, identifier).toString()])
    }

    this.hint(outbox(pubkey)).then(url => {
      for (const tag of tags.slice(1)) {
        tag.push(url)
      }
    })

    this.rootTags = tags

    return this
  }

  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    const tags = [
      ["k", String(kind)],
      ["e", id],
      ["p", pubkey],
    ]

    if (identifier) {
      tags.push(["a", new Address(kind, pubkey, identifier).toString()])
    }

    this.hint(outbox(pubkey)).then(url => {
      for (const tag of tags.slice(1)) {
        tag.push(url)
      }
    })

    this.parentTags = tags

    return this
  }

  setRootFromEvent(event: TrustedEvent) {
    this.setRoot(event.kind, event.id, event.pubkey, tagValue(tagSpec("d"), event.tags))

    return this
  }

  setParentFromEvent(event: TrustedEvent) {
    this.setParent(event.kind, event.id, event.pubkey, tagValue(tagSpec("d"), event.tags))

    return this
  }

  protected renderDomainTags() {
    return [...this.rootTags, ...this.parentTags]
  }
}

export const Comment = new KindFactory({
  kind: COMMENT,
  reader: CommentReader,
  writer: CommentWriter,
})
