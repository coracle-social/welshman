import {uniq, spec} from "@welshman/lib"
import {POLL_RESPONSE, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-88 kind-1018 poll response.
export class PollResponseReader extends EventReader {
  readonly kind = POLL_RESPONSE

  pollId() {
    return getTagValue("e", this.event.tags) || ""
  }

  selections() {
    return uniq(getTagValues("response", this.event.tags))
  }
}

export class PollResponseWriter extends EventWriter<PollResponseReader> {
  readonly kind = POLL_RESPONSE

  setPollId(pollId: string) {
    return this.dropTags(spec(["e"])).addTags(["e", pollId])
  }

  addSelection(id: string) {
    return this.dropTags(spec(["response", id])).addTags(["response", id])
  }

  protected validate() {
    super.validate()

    if (!this.extraTags.some(spec(["e"]))) {
      throw new Error("PollResponse requires a pollId")
    }
  }
}

export const PollResponse = new KindFactory({
  reader: PollResponseReader,
  writer: PollResponseWriter,
})
