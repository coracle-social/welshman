import {first, parseJson, spec} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {
  GENERIC_REPOST,
  NOTE,
  REPOST,
  getAddress,
  isReplaceable,
  kindTags,
  outbox,
  tagSpec,
  tagValue,
  tagValues,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const TARGET_KEYS = ["e", "a", "p", "k"]

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

  // The embedded event, or undefined when the content is absent or malformed.
  repostedEvent() {
    return parseJson(this.event.content) as Maybe<TrustedEvent>
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

    if (!this.extraTags.some(spec(["e"]))) {
      throw new Error("A repost must reference an event via an e tag")
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
