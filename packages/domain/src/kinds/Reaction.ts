import {first, spec} from "@welshman/lib"
import {REACTION, getTagValue, getKindTagValues, getAddress, isReplaceable} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

const TARGET_KEYS = ["e", "a", "p", "k"]

// NIP-25 kind-7 reaction. The content is "+", "-", a unicode emoji, or a
// `:shortcode:` referencing a NIP-30 `emoji` tag — set it via `setContent`.
export class Reaction extends EventReader {
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

  builder() {
    return new ReactionBuilder(this)
  }
}

export class ReactionBuilder extends EventBuilder<Reaction> {
  readonly kind = REACTION

  // A reaction targets exactly one event, so replace any existing target.
  setEvent(event: TrustedEvent, relay?: string) {
    this.dropTags(t => TARGET_KEYS.includes(t[0])).addTags(
      ["k", String(event.kind)],
      relay ? ["p", event.pubkey, relay] : ["p", event.pubkey],
      relay ? ["e", event.id, relay] : ["e", event.id],
    )

    if (isReplaceable(event)) {
      this.addTags(relay ? ["a", getAddress(event), relay] : ["a", getAddress(event)])
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
