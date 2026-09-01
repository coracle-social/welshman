import {allPass, nth, nthEq, nthNe, somePass, spec} from "@welshman/lib"
import {
  HIGHLIGHT,
  addressTags,
  getAddress,
  hexTags,
  isReplaceable,
  matchTags,
  tagMatcher,
  tagSpec,
  tagValue,
  tagValues,
  topicTags,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// What a highlight was taken from: a nostr event (`e`), an addressable event
// (`a`), a NIP-73 external id (`i`), or anything else (`r`, a url or plain text).
// A highlight of a replaceable event carries both an `e` and an `a` tag.
export type HighlightSource =
  | {type: "event"; id: string; relay: string}
  | {type: "address"; address: string; relay: string}
  | {type: "external"; id: string}
  | {type: "reference"; value: string}

// A pubkey credited on the highlighted material. NIP-84 names "author" and
// "editor"; the role is optional and open-ended.
export type HighlightAttribution = {
  pubkey: string
  relay: string
  role?: string
}

const isSourceTag = tagMatcher(tagSpec(["e", "a", "i"]))

const isReferenceTag = tagMatcher(tagSpec("r"))

const isSource = allPass(isReferenceTag, nthNe(2, "mention"))

const isReference = allPass(isReferenceTag, nthEq(2, "mention"))

// NIP-84 kind-9802 highlight. `content` is the highlighted excerpt, which may be
// empty when the source is non-text media (e.g. NIP-94 audio/video).
//
// A `comment` tag makes it a quote highlight, rendered like a quote repost. In
// that case a p tag marked "mention" is named in the comment rather than credited
// for the source, and the same marker on an r tag means the reference came from
// the comment.
export class HighlightReader extends EventReader {
  sources(): HighlightSource[] {
    const tags = this.event.tags

    return [
      ...matchTags(hexTags("e"), tags).map(([, id, relay = ""]) => ({
        type: "event" as const,
        id,
        relay,
      })),
      ...matchTags(addressTags("a"), tags).map(([, address, relay = ""]) => ({
        type: "address" as const,
        address,
        relay,
      })),
      ...tagValues(tagSpec("i"), tags).map(id => ({type: "external" as const, id})),
      ...tags
        .filter(isSource)
        .map(nth(1))
        .map(value => ({type: "reference" as const, value})),
    ]
  }

  // Everyone credited for the highlighted material, as author or editor. Older
  // clients omit the role, so an unmarked p tag counts as an attribution.
  attributions(): HighlightAttribution[] {
    return matchTags(hexTags("p"), this.event.tags)
      .filter(nthNe(3, "mention"))
      .map(([, pubkey, relay = "", role]) => ({pubkey, relay, role}))
  }

  mentions() {
    return matchTags(hexTags("p"), this.event.tags).filter(nthEq(3, "mention")).map(nth(1))
  }

  // Named `sourceContext` because `context` is the reader's own `KindContext`.
  sourceContext() {
    return tagValue(tagSpec("context"), this.event.tags)
  }

  comment() {
    return tagValue(tagSpec("comment"), this.event.tags)
  }

  references() {
    return this.event.tags.filter(isReference).map(nth(1))
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }
}

export class HighlightWriter extends EventWriter<HighlightReader> {
  setSourceEvent(event: TrustedEvent) {
    this.dropTags(somePass(isSourceTag, isSource))

    const eTag = ["e", event.id, ""]

    this.addTags(eTag)

    this.hint(outbox(event.pubkey)).then(url => {
      eTag[2] = url
    })

    if (isReplaceable(event)) {
      const aTag = ["a", getAddress(event), ""]

      this.addTags(aTag)

      this.hint(outbox(event.pubkey)).then(url => {
        aTag[2] = url
      })
    }

    return this.addAttribution(event.pubkey)
  }

  setSourceExternal(id: string) {
    return this.dropTags(somePass(isSourceTag, isSource)).addTags(["i", id])
  }

  setSourceReference(value: string) {
    return this.dropTags(somePass(isSourceTag, isSource)).addTags(["r", value, "source"])
  }

  addAttribution(pubkey: string, role = "author") {
    this.dropTags(spec(["p", pubkey]))

    const tag = ["p", pubkey, "", role]

    this.addTags(tag)

    this.hint(outbox(pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  removeAttribution(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  addMention(pubkey: string) {
    return this.addAttribution(pubkey, "mention")
  }

  setSourceContext(context: string) {
    return this.dropTags(spec(["context"])).addTags(["context", context])
  }

  clearSourceContext() {
    return this.dropTags(spec(["context"]))
  }

  setComment(comment: string) {
    return this.dropTags(spec(["comment"])).addTags(["comment", comment])
  }

  clearComment() {
    return this.dropTags(spec(["comment"]))
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }
}

export const Highlight = new KindFactory({
  kind: HIGHLIGHT,
  reader: HighlightReader,
  writer: HighlightWriter,
})
