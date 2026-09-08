import {spec} from "@welshman/lib"
import {PIN, matchTag, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// A pin references exactly one piece of content: a nostr event (`e`), an
// addressable event (`a`), or an external id (`i`, with an optional `k` kind).
export type PinReference =
  | {type: "event"; id: string; relay?: string}
  | {type: "address"; address: string; relay?: string}
  | {type: "external"; id: string; kind?: string}

const REFERENCE_KEYS = ["e", "a", "i", "k"]

// Pinboards-NIP kind-39067 pin — a single pinned item. Pins reference one or
// more boards via `A` tags (none means it's a profile pin). Kind 39067 sits in
// the parameterized-replaceable range, so each pin needs its own unique `d`
// tag (see `PinWriter`) — otherwise every pin from the same author would
// collide at the same address and replace one another.
export class PinReader extends EventReader {
  boards() {
    return tagValues(tagSpec("A"), this.event.tags)
  }

  isProfilePin() {
    return this.boards().length === 0
  }

  reference(): PinReference | undefined {
    const e = matchTag(tagSpec("e"), this.event.tags)

    if (e) return {type: "event", id: e[1], relay: e[2]}

    const a = matchTag(tagSpec("a"), this.event.tags)

    if (a) return {type: "address", address: a[1], relay: a[2]}

    const i = matchTag(tagSpec("i"), this.event.tags)

    if (i) return {type: "external", id: i[1], kind: tagValue(tagSpec("k"), this.event.tags)}
  }

  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }
}

export class PinWriter extends EventWriter<PinReader> {
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
    return this.dropTags(t => REFERENCE_KEYS.includes(t[0] as string))
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(t => ["e", "a", "i"].includes(t[0] as string))) {
      throw new Error("A pin must reference content via an e, a, or i tag")
    }
  }
}

export class PinQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const Pin = new KindFactory({
  kind: PIN,
  reader: PinReader,
  writer: PinWriter,
  query: PinQuery,
})
