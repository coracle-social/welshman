import {first, spec} from "@welshman/lib"
import {
  REACTION,
  kindTags,
  tagSpec,
  tagValue,
  tagValues,
  getAddress,
  isReplaceable,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

const TARGET_KEYS = ["e", "a", "p", "k"]

// NIP-25 kind-7 reaction. The content is "+", "-", a unicode emoji, or a
// `:shortcode:` referencing a NIP-30 `emoji` tag — set it via `setContent`.
export class ReactionReader extends EventReader {
  eventId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }

  eventAddress() {
    return tagValue(tagSpec("a"), this.event.tags)
  }

  pubkey() {
    return tagValue(tagSpec("p"), this.event.tags)
  }

  eventKind() {
    return first(tagValues(kindTags("k"), this.event.tags))
  }
}

export class ReactionWriter extends EventWriter<ReactionReader> {
  // A reaction targets exactly one event, so replace any existing target.
  setEvent(event: TrustedEvent) {
    this.dropTags(t => TARGET_KEYS.includes(t[0] as string))
    this.addTags(["k", String(event.kind)])
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

    return this
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["e"]))) {
      throw new Error("A reaction must reference an event via an e tag")
    }
  }
}

export const Reaction = new KindFactory({
  kind: REACTION,
  reader: ReactionReader,
  writer: ReactionWriter,
})
