import {
  first,
  spec} from "@welshman/lib"
import {REACTION,
  getTagValue,
  getKindTagValues,
  getAddress,
  isReplaceable,
  outbox,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {hint} from "../Hint.js"
import {KindFactory} from "../Kind.js"

const TARGET_KEYS = ["e", "a", "p", "k"]

// NIP-25 kind-7 reaction. The content is "+", "-", a unicode emoji, or a
// `:shortcode:` referencing a NIP-30 `emoji` tag — set it via `setContent`.
export class ReactionReader extends EventReader {
  readonly kind = REACTION

  eventId() {
    return getTagValue("e", this.event.tags)
  }

  eventAddress() {
    return getTagValue("a", this.event.tags)
  }

  pubkey() {
    return getTagValue("p", this.event.tags)
  }

  eventKind() {
    return first(getKindTagValues(this.event.tags))
  }

  emojis() {
    return this.tags().filter(spec(["emoji"]))
  }
}

export class ReactionWriter extends EventWriter<ReactionReader> {
  readonly kind = REACTION


  // A reaction targets exactly one event, so replace any existing target.
  setEvent(event: TrustedEvent) {
    this.dropTags(t => TARGET_KEYS.includes(t[0] as string)).addTags(
      ["k", String(event.kind)],
      this.tagPubkey(event.pubkey),
      ["e", event.id, hint(outbox(event.pubkey))],
    )

    if (isReplaceable(event)) {
      this.addTags(["a", getAddress(event), hint(outbox(event.pubkey))])
    }

    return this
  }

  addEmoji(shortcode: string, url: string) {
    return this.addTags(["emoji", shortcode, url])
  }

  removeEmoji(shortcode: string) {
    return this.dropTags(spec(["emoji", shortcode]))
  }

  protected validate() {
    super.validate()

    if (!this.extraTags.some(spec(["e"]))) {
      throw new Error("A reaction must reference an event via an e tag")
    }
  }
}

export const Reaction = new KindFactory({
  reader: ReactionReader,
  writer: ReactionWriter,
})
