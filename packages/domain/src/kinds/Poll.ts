import {now, uniq, first, randomId} from "@welshman/lib"
import {POLL, getTagValue, getTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

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
export class Poll extends EventReader {
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

  builder() {
    return new PollBuilder(this)
  }
}

export class PollBuilder extends EventBuilder<Poll> {
  readonly kind = POLL

  title = ""
  optionTags: string[][] = []
  pollTypeTag?: string[]
  endsAtTag?: string[]
  urlTags: string[][] = []

  constructor(readonly reader?: Poll) {
    super(reader)

    this.title = reader?.title() ?? ""
    this.optionTags = this.consumeTags("option")
    this.pollTypeTag = first(this.consumeTags("polltype"))
    this.endsAtTag = first(this.consumeTags("endsAt"))
    this.urlTags = this.consumeTags("relay")
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  addOption(label: string, id = randomId()) {
    this.optionTags = [...this.optionTags, ["option", id, label]]

    return this
  }

  setPollType(pollType: PollType) {
    this.pollTypeTag = ["polltype", pollType]

    return this
  }

  setEndsAt(endsAt: number) {
    this.endsAtTag = ["endsAt", String(endsAt)]

    return this
  }

  setUrls(urls: string[]) {
    this.urlTags = urls.map(url => ["relay", url])

    return this
  }

  protected validate() {
    super.validate()

    if (this.optionTags.length === 0) {
      throw new Error("Poll requires at least one option")
    }
  }

  protected buildContent(_signer?: ISigner) {
    return this.title
  }

  protected buildTags() {
    const tags: string[][] = [...this.optionTags, this.pollTypeTag ?? ["polltype", "singlechoice"]]

    if (this.endsAtTag) tags.push(this.endsAtTag)

    tags.push(...this.urlTags)

    return tags
  }
}
