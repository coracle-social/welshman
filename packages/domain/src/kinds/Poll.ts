import {now, uniq, randomId, spec} from "@welshman/lib"
import {POLL, getTagValue, getTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

export type PollType = "singlechoice" | "multiplechoice"

export type PollOption = {
  id: string
  label: string
}

export type PollResult = {
  options: {id: string; label: string; votes: number}[]
  voters: number
}

// NIP-88 kind-1068 poll.
export class PollReader extends EventReader {
  readonly kind = POLL

  title() {
    return this.event.content || ""
  }

  options(): PollOption[] {
    return this.event.tags.filter(t => t[0] === "option").map(([, id, label = id]) => ({id, label}))
  }

  pollType(): PollType {
    return (getTagValue("polltype", this.event.tags) as PollType) || "singlechoice"
  }

  endsAt() {
    const endsAt = parseInt(getTagValue("endsAt", this.event.tags) ?? "")

    return isNaN(endsAt) ? undefined : endsAt
  }

  isClosed() {
    const endsAt = this.endsAt()

    return endsAt !== undefined && endsAt <= now()
  }

  urls() {
    return getTagValues("relay", this.event.tags)
  }

  results(responses: TrustedEvent[]): PollResult {
    const options = this.options().map(option => ({...option, votes: 0}))
    const counts = new Map(options.map(option => [option.id, option]))
    const latestByPubkey = new Map<string, TrustedEvent>()
    const pollType = this.pollType()

    for (const response of responses) {
      const current = latestByPubkey.get(response.pubkey)

      if (!current || response.created_at > current.created_at) {
        latestByPubkey.set(response.pubkey, response)
      }
    }

    for (const response of latestByPubkey.values()) {
      const selections = getTagValues("response", response.tags)
      const ids = pollType === "singlechoice" ? selections.slice(0, 1) : uniq(selections)

      for (const id of ids) {
        const option = counts.get(id)

        if (option) {
          option.votes += 1
        }
      }
    }

    return {options, voters: latestByPubkey.size}
  }
}

export class PollBuilder extends EventBuilder<PollReader> {
  readonly kind = POLL

  setTitle(title: string) {
    this.content = title

    return this
  }

  addOption(label: string, id = randomId()) {
    return this.addTags(["option", id, label])
  }

  setPollType(pollType: PollType) {
    return this.dropTags(spec(["polltype"])).addTags(["polltype", pollType])
  }

  setEndsAt(endsAt: number) {
    return this.dropTags(spec(["endsAt"])).addTags(["endsAt", String(endsAt)])
  }

  setUrls(urls: string[]) {
    return this.dropTags(spec(["relay"])).addTags(...urls.map(url => ["relay", url]))
  }

  protected validate() {
    super.validate()

    if (!this.extraTags.some(spec(["option"]))) {
      throw new Error("Poll requires at least one option")
    }
  }
}

export const Poll = new Kind({
  reader: PollReader,
  builder: PollBuilder,
  router: ContentRouter,
})
