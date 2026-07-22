import {nth, nthEq, mapVals, uniq} from "@welshman/lib"
import {
  NOTE,
  hexTags,
  matchTags,
  tagValues,
  getAddress,
  isReplaceable,
  isRelayUrl,
  isShareableRelayUrl,
  outbox,
  relays,
} from "@welshman/util"
import type {TrustedEvent, RelaySelection} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-10 reply threading tags, split into roots, replies, and mentions by their
// markers (or positionally when unmarked). `q` tags are always mentions.
export const getReplyTags = (tags: string[][]) => {
  const validTags = tags.filter(t => ["a", "e", "q"].includes(t[0]))
  const mentionTags = validTags.filter(nthEq(0, "q"))
  const roots: string[][] = []
  const replies: string[][] = []
  const mentions: string[][] = []

  const dispatchTags = (thisTags: string[][]) =>
    thisTags.forEach((t: string[], i: number) => {
      if (t[3] === "root") {
        if (validTags.filter(nthEq(3, "reply")).length === 0) {
          replies.push(t)
        } else {
          roots.push(t)
        }
      } else if (t[3] === "reply") {
        replies.push(t)
      } else if (t[3] === "mention") {
        mentions.push(t)
      } else if (i === thisTags.length - 1) {
        replies.push(t)
      } else if (i === 0) {
        roots.push(t)
      } else {
        mentions.push(t)
      }
    })

  // Add different types separately so positional logic works
  dispatchTags(validTags.filter(nthEq(0, "e")))
  dispatchTags(validTags.filter(nthEq(0, "a")).filter(t => Boolean(t[3])))
  mentionTags.forEach((t: string[]) => mentions.push(t))

  return {roots, replies, mentions}
}

export const getReplyTagValues = (tags: string[][]) =>
  mapVals(tags => tags.map(nth(1)), getReplyTags(tags))

// NIP-01 kind-1 short text note.
export class NoteReader extends EventReader {}

export class NoteWriter extends EventWriter<NoteReader> {
  // NIP-10 reply threading: p-tag the parent's participants, then e/a-tag the
  // parent (and thread root) with the appropriate markers and relay hints.
  setParent(event: TrustedEvent) {
    for (const pubkey of uniq([event.pubkey, ...tagValues(hexTags("p"), event.tags)])) {
      this.addMention(pubkey)
    }

    const {roots, replies} = getReplyTags(event.tags)
    const parents = roots.length > 0 ? roots : replies
    const mark = parents.length > 0 ? "reply" : "root"

    // If the parent carried roots use them, otherwise fall back to its replies.
    for (const [k, id, originalHint = "", , pubkey = ""] of parents) {
      if (isShareableRelayUrl(originalHint)) {
        this.addTags([k, id, originalHint, "root", pubkey])
      } else {
        const tag = [k, id, "", "root", pubkey]

        this.addTags(tag)

        this.hint(...this.eventRootsSelections(event)).then(url => {
          tag[2] = url
        })
      }
    }

    const eTag = ["e", event.id, "", mark, event.pubkey]

    this.addTags(eTag)

    this.hint(outbox(event.pubkey)).then(url => {
      eTag[2] = url
    })

    if (isReplaceable(event)) {
      const aTag = ["a", getAddress(event), "", mark, event.pubkey]

      this.addTags(aTag)

      this.hint(outbox(event.pubkey)).then(url => {
        aTag[2] = url
      })
    }

    return this
  }

  // Relay selections for a reply's thread root: the roots' and mentions' authors
  // plus any relay hints already present on those tags.
  private eventRootsSelections(event: TrustedEvent): RelaySelection[] {
    const {roots} = getReplyTags(event.tags)
    const mentions = matchTags(hexTags("p"), event.tags)
    const authors = roots.map(nth(3)).filter(p => p?.length === 64)
    const others = mentions.map(nth(1)).filter(p => p?.length === 64)
    const relayUrls = uniq([...roots, ...mentions].map(nth(2)).filter(r => r && isRelayUrl(r)))

    return [
      ...authors.map(pubkey => outbox(pubkey, 10)),
      ...others.map(pubkey => outbox(pubkey)),
      ...relays(relayUrls),
    ]
  }
}

export const Note = new KindFactory({
  kind: NOTE,
  reader: NoteReader,
  writer: NoteWriter,
})
