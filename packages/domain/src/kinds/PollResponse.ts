import {uniq, uniqBy, first} from "@welshman/lib"
import {POLL_RESPONSE, getTagValue, getTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-88 kind-1018 poll response.
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

  pollIdTag?: string[]
  selectionTags: string[][] = []

  constructor(readonly reader?: PollResponse) {
    super(reader)

    this.pollIdTag = first(this.consumeTags("e"))
    this.selectionTags = uniqBy(t => t[1], this.consumeTags("response"))
  }

  setPollId(pollId: string) {
    this.pollIdTag = ["e", pollId]

    return this
  }

  addSelection(id: string) {
    this.selectionTags = uniqBy(t => t[1], [...this.selectionTags, ["response", id]])

    return this
  }

  protected validate() {
    super.validate()

    if (!this.pollIdTag) {
      throw new Error("PollResponse requires a pollId")
    }
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.pollIdTag) tags.push(this.pollIdTag)

    return [...tags, ...this.selectionTags]
  }
}
