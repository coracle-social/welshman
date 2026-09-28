import {first, parseJson, spec} from "@welshman/lib"
import {
  GENERIC_REPOST,
  NOTE,
  REPOST,
  getAddress,
  getHash,
  isHashedEvent,
  isReplaceable,
  kindTags,
  outbox,
  tagSpec,
  tagValue,
  tagValues,
  verifyEvent,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const TARGET_KEYS = ["e", "a", "p", "k"]

// The content's event, when it has an event's shape. Its signature is not checked.
const parseEvent = (content: string) => {
  const event = parseJson<TrustedEvent>(content)

  return event && isHashedEvent(event) ? event : undefined
}

// NIP-18 repost. Kind 6 reposts notes; kind 16 reposts any other kind and names
// it in a `k` tag. The reposted event is JSON-encoded in the content so a client
// can render it without a second fetch.
export class RepostReader extends EventReader {
  eventId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }

  eventAddress() {
    return tagValue(tagSpec("a"), this.event.tags)
  }

  pubkey() {
    return tagValue(tagSpec("p"), this.event.tags)
  }

  // Kind 6 only reposts notes, so it carries no `k` tag to read.
  eventKind() {
    return this.kind === REPOST ? NOTE : first(tagValues(kindTags("k"), this.event.tags))
  }

  // The embedded event, or undefined when the content is absent, malformed, or a
  // different event from the one the e tag names.
  repostedEvent() {
    const event = parseEvent(this.event.content)
    const eventId = this.eventId()

    return event && (!eventId || event.id === eventId) ? event : undefined
  }
}

export class RepostWriter extends EventWriter<RepostReader> {
  // A repost wraps exactly one event, so replace any existing target.
  setEvent(event: TrustedEvent) {
    this.dropTags(t => TARGET_KEYS.includes(t[0] as string))
    this.setContent(JSON.stringify(event))
    this.addMention(event.pubkey)

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

    // Kind 6 is defined as a note repost, so the kind is implicit there.
    if (this.kind === GENERIC_REPOST) {
      this.addTags(["k", String(event.kind)])
    }

    return this
  }

  validate() {
    super.validate()

    const eventId = this.extraTags.find(spec(["e"]))?.[1]
    const kind = this.extraTags.find(spec(["k"]))?.[1]

    if (!eventId) {
      throw new Error("A repost must reference an event via an e tag")
    }

    // Content may be left empty (e.g. for a protected event), but anything else must be the event.
    if (this.content) {
      const event = parseEvent(this.content)

      if (!event) {
        throw new Error("A repost's content must be the reposted event")
      }

      if (event.id !== eventId) {
        throw new Error("A repost's embedded event must be the one its e tag names")
      }

      if (getHash(event) !== event.id) {
        throw new Error("A repost's embedded event has an invalid id")
      }

      if (!verifyEvent(event)) {
        throw new Error("A repost's embedded event has an invalid signature")
      }

      if (this.kind === REPOST && event.kind !== NOTE) {
        throw new Error(
          "A kind 6 repost must embed a kind 1 note; use GenericRepost for other kinds",
        )
      }

      if (kind !== undefined && kind !== String(event.kind)) {
        throw new Error("A repost's embedded event must match its k tag")
      }
    }
  }
}

export class RepostQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Repost = new KindFactory({
  kind: REPOST,
  reader: RepostReader,
  writer: RepostWriter,
  query: RepostQuery,
})

export const GenericRepost = new KindFactory({
  kind: GENERIC_REPOST,
  reader: RepostReader,
  writer: RepostWriter,
  query: RepostQuery,
})
