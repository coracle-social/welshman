import {uniq} from "@welshman/lib"
import {POLL_RESPONSE, getTagValue, getTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-88 kind-1018 poll vote. Empty content; the target poll is referenced via
// an "e" tag and each chosen option id lives in its own "response" tag. Tags-only
// content, so it extends EventReader/EventBuilder directly.
export class PollResponse extends EventReader {
  static kind = POLL_RESPONSE

  protected validate() {
    if (!this.pollId()) {
      throw new Error("PollResponse requires an e tag")
    }
  }

  protected reservedTagKeys() {
    return ["e", "response"]
  }

  pollId() {
    return getTagValue("e", this.event.tags) || ""
  }

  selections() {
    return uniq(getTagValues("response", this.event.tags))
  }

  builder() {
    const builder = new PollResponseBuilder()

    builder.pollId = this.pollId()
    builder.selections = this.selections()

    return this.seedBuilder(builder)
  }
}

export class PollResponseBuilder extends EventBuilder {
  static kind = POLL_RESPONSE

  pollId = ""
  selections: string[] = []

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
