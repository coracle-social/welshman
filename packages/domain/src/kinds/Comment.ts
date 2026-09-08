import {first, mapVals, nth, prop, uniqBy} from "@welshman/lib"
import {
  COMMENT,
  Address,
  isParameterizedReplaceableKind,
  tagSpec,
  tagValue,
  getCommentFiltersForParent,
  getCommentFiltersForRoot,
  inbox,
  outbox,
} from "@welshman/util"
import type {Filter, TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
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
    // Hint slot is index 2 in every reference tag; NIP-22 puts the referenced
    // event's pubkey after it on E tags.
    const tags = [
      ["K", String(kind)],
      ["E", id, "", pubkey],
      ["P", pubkey, ""],
    ]

    if (identifier && isParameterizedReplaceableKind(kind)) {
      tags.push(["A", new Address(kind, pubkey, identifier).toString(), ""])
    }

    this.hint(outbox(pubkey)).then(url => {
      for (const tag of tags.slice(1)) {
        tag[2] = url
      }
    })

    this.rootTags = tags

    return this
  }

  setParent(kind: number, id: string, pubkey: string, identifier?: string) {
    const tags = [
      ["k", String(kind)],
      ["e", id, "", pubkey],
      ["p", pubkey, ""],
    ]

    if (identifier && isParameterizedReplaceableKind(kind)) {
      tags.push(["a", new Address(kind, pubkey, identifier).toString(), ""])
    }

    this.hint(outbox(pubkey)).then(url => {
      for (const tag of tags.slice(1)) {
        tag[2] = url
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

export class CommentQuery extends EventQuery {
  rootEvents: TrustedEvent[] = []
  parentEvents: TrustedEvent[] = []

  // Comments anywhere in `event`'s thread (NIP-22 uppercase reference tags).
  forRoot(event: TrustedEvent) {
    this.rootEvents = uniqBy(prop("id"), [...this.rootEvents, event])

    return this
  }

  // Direct replies to `event` (lowercase reference tags).
  forParent(event: TrustedEvent) {
    this.parentEvents = uniqBy(prop("id"), [...this.parentEvents, event])

    return this
  }

  // Each target contributes an id filter and, when it's replaceable, an address
  // filter. A comment references its target one way or the other, never both.
  protected renderDomainFilters(): Filter[] {
    const filters = [
      ...getCommentFiltersForRoot(this.rootEvents),
      ...getCommentFiltersForParent(this.parentEvents),
    ]

    return filters.length > 0 ? filters : [{}]
  }

  protected renderRoutes() {
    const targets = [...this.rootEvents, ...this.parentEvents]

    return [
      ...this.authorRoutes(),
      ...this.mentionRoutes(),
      ...targets.map(event => inbox(event.pubkey, 0.5)),
    ]
  }
}

export const Comment = new KindFactory({
  kind: COMMENT,
  reader: CommentReader,
  writer: CommentWriter,
  query: CommentQuery,
})
