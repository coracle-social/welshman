import {uniq, first} from "@welshman/lib"
import {POLL_RESPONSE, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-88 kind-1018 poll vote. Empty content; the target poll is referenced via
// an "e" tag and each chosen option id lives in its own "response" tag. Tags-only
// content, so it extends EventReader/EventBuilder directly.
export class PollResponse extends EventReader {
  readonly kind = POLL_RESPONSE

  pollId() {
    return getTagValue("e", this.event.tags) || ""
  }

  selections() {
    return uniq(getTagValues("response", this.event.tags))
  }

  builder() {
    return new PollResponseBuilder(this)
  }
}

export class PollResponseBuilder extends EventBuilder<PollResponse> {
  readonly kind = POLL_RESPONSE

  pollId = ""
  selections: string[] = []

  constructor(readonly reader?: PollResponse) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    this.pollId = first(this.consumeTags("e"))?.[1] ?? ""
    this.selections = uniq(this.consumeTags("response").map(t => t[1]))
  }

  setPollId(pollId: string) {
    this.pollId = pollId

    return this
  }

  addSelection(id: string) {
    this.selections = uniq([...this.selections, id])

    return this
  }

  protected validate() {
    if (!this.pollId) {
      throw new Error("PollResponse requires a pollId")
    }
  }

  protected buildTags() {
    return [["e", this.pollId], ...this.selections.map(id => ["response", id])]
  }
}
