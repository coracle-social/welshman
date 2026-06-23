import {spec} from "@welshman/lib"
import {PIN, getTag, getTagValue, getTagValues, getTopicTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// A pin references exactly one piece of content: a nostr event (`e`), an
// addressable event (`a`), or an external id (`i`, with an optional `k` kind).
export type PinReference =
  | {type: "event"; id: string; relay?: string}
  | {type: "address"; address: string; relay?: string}
  | {type: "external"; id: string; kind?: string}

const REFERENCE_KEYS = ["e", "a", "i", "k"]

// Pinboards-NIP kind-39067 pin — a single pinned item. Pins reference one or
// more boards via `A` tags (none means it's a profile pin). Despite sitting in
// the addressable range, a pin is a regular event with no `d` tag.
export class Pin extends EventReader {
  readonly kind = PIN

  boards() {
    return getTagValues("A", this.event.tags)
  }

  isProfilePin() {
    return this.boards().length === 0
  }

  reference(): PinReference | undefined {
    const e = getTag("e", this.event.tags)

    if (e) return {type: "event", id: e[1], relay: e[2]}

    const a = getTag("a", this.event.tags)

    if (a) return {type: "address", address: a[1], relay: a[2]}

    const i = getTag("i", this.event.tags)

    if (i) return {type: "external", id: i[1], kind: getTagValue("k", this.event.tags)}
  }

  title() {
    return getTagValue("title", this.event.tags)
  }

  topics() {
    return getTopicTagValues(this.event.tags)
  }

  builder() {
    return new PinBuilder(this)
  }
}

export class PinBuilder extends EventBuilder<Pin> {
  readonly kind = PIN

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  addBoard(address: string) {
    return this.addTags(["A", address])
  }

  removeBoard(address: string) {
    return this.dropTags(t => t[0] === "A" && t[1] === address)
  }

  setEvent(id: string, relay?: string) {
    return this.dropReference().addTags(relay ? ["e", id, relay] : ["e", id])
  }

  setAddress(address: string, relay?: string) {
    return this.dropReference().addTags(relay ? ["a", address, relay] : ["a", address])
  }

  setExternal(id: string, kind?: string) {
    this.dropReference().addTags(["i", id])

    return kind ? this.addTags(["k", kind]) : this
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }

  // A pin references exactly one item, so replace any existing reference.
  private dropReference() {
    return this.dropTags(t => REFERENCE_KEYS.includes(t[0]))
  }

  protected validate() {
    // A pin is a regular event (no `d` tag), so skip the base d-tag check and
    // instead require the single content reference the spec mandates.
    if (!this.extraTags.some(t => ["e", "a", "i"].includes(t[0]))) {
      throw new Error("A pin must reference content via an e, a, or i tag")
    }
  }
}
