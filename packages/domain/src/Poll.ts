import {now, uniq, randomId} from "@welshman/lib"
import {POLL, getTagValue, getTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {EventReader, EventBuilder} from "./base.js"

export type PollType = "singlechoice" | "multiplechoice"

export type PollOption = {
  id: string
  label: string
}

export type PollResult = {
  options: {id: string; label: string; votes: number}[]
  voters: number
}

// NIP-88 kind-1068 poll. The poll title/question lives in `content` as plain
// text (not JSON), options come from "option" tags, and the response tally is
// computed from sibling kind-1018 response events passed into `results`.
export class Poll extends EventReader {
  static kind = POLL

  protected validate() {
    if (this.options().length === 0) {
      throw new Error("Poll requires at least one option tag")
    }
  }

  protected reservedTagKeys() {
    return ["option", "polltype", "endsAt", "relay"]
  }

  // The poll title/question is plain-text content.
  title() {
    return this.event.content || ""
  }

  options(): PollOption[] {
    return this.event.tags
      .filter(t => t[0] === "option")
      .map(t => ({id: t[1], label: t[2] || t[1]}))
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

    return endsAt != null && endsAt <= now()
  }

  relays() {
    return getTagValues("relay", this.event.tags)
  }

  // Tally the latest response per pubkey across the poll options. Each response
  // is a kind-1018 event whose "response" tags name selected option ids;
  // single-choice polls only honor the first selection.
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
    const builder = new PollBuilder(this.title())

    builder.options = this.options()
    builder.pollType = this.pollType()
    builder.endsAt = this.endsAt()
    builder.relays = this.relays()

    return this.seedBuilder(builder)
  }
}

export class PollBuilder extends EventBuilder {
  static kind = POLL

  options: PollOption[] = []
  pollType: PollType = "singlechoice"
  endsAt?: number
  relays: string[] = []

  constructor(public title = "") {
    super()
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  addOption(label: string, id = randomId()) {
    this.options = [...this.options, {id, label}]

    return this
  }

  setPollType(pollType: PollType) {
    this.pollType = pollType

    return this
  }

  setEndsAt(endsAt: number) {
    this.endsAt = endsAt

    return this
  }

  setRelays(relays: string[]) {
    this.relays = relays

    return this
  }

  protected validate() {
    if (this.options.length === 0) {
      throw new Error("Poll requires at least one option")
    }
  }

  protected buildContent(_signer?: ISigner) {
    return this.title
  }

  protected buildTags() {
    const tags: string[][] = [
      ...this.options.map(o => ["option", o.id, o.label]),
      ["polltype", this.pollType],
    ]

    if (this.endsAt != null) {
      tags.push(["endsAt", String(this.endsAt)])
    }

    for (const relay of this.relays) {
      tags.push(["relay", relay])
    }

    return tags
  }
}
