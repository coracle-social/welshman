import {now, uniq} from "@welshman/lib"
import {POLL, getTagValue, getTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type PollType = "singlechoice" | "multiplechoice"

export type PollOption = {
  id: string
  label: string
}

export type PollResult = {
  options: {id: string; label: string; votes: number}[]
  voters: number
}

export type PollValues = {
  title: string
  options: PollOption[]
  pollType: PollType
  endsAt?: number
  relays: string[]
  h?: string
}

export const makePollValues = (values: Partial<PollValues> = {}): PollValues => ({
  title: "",
  options: [],
  pollType: "singlechoice",
  relays: [],
  ...values,
})

// NIP-88 kind-1068 poll. The poll title/question lives in `content` as plain
// text (not JSON), options come from "option" tags, and the response tally is
// computed from sibling kind-1018 response events passed into `results`.
export class Poll extends DomainObject<PollValues> {
  readonly kind = POLL
  values = makePollValues()

  protected normalizeValues(values: Partial<PollValues> = {}) {
    return makePollValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<PollValues> {
    const endsAtRaw = getTagValue("endsAt", event.tags)
    const endsAt = endsAtRaw == null ? NaN : parseInt(endsAtRaw)

    return {
      title: event.content || "",
      options: event.tags
        .filter(t => t[0] === "option")
        .map(t => ({id: t[1], label: t[2] || t[1]})),
      pollType: (getTagValue("polltype", event.tags) as PollType) || "singlechoice",
      endsAt: Number.isNaN(endsAt) ? undefined : endsAt,
      relays: getTagValues("relay", event.tags),
      h: getTagValue("h", event.tags),
    }
  }

  title() {
    return this.values.title
  }

  options() {
    return this.values.options
  }

  pollType() {
    return this.values.pollType
  }

  endsAt() {
    return this.values.endsAt
  }

  isClosed() {
    return this.values.endsAt != null && this.values.endsAt <= now()
  }

  relays() {
    return this.values.relays
  }

  h() {
    return this.values.h
  }

  // Tally the latest response per pubkey across the poll options. Each response
  // is a kind-1018 event whose "response" tags name selected option ids;
  // single-choice polls only honor the first selection.
  results(responses: TrustedEvent[]): PollResult {
    const options = this.values.options.map(option => ({...option, votes: 0}))
    const counts = new Map(options.map(option => [option.id, option]))
    const latestByPubkey = new Map<string, TrustedEvent>()

    for (const response of responses) {
      const current = latestByPubkey.get(response.pubkey)

      if (!current || response.created_at > current.created_at) {
        latestByPubkey.set(response.pubkey, response)
      }
    }

    for (const response of latestByPubkey.values()) {
      const selections = getTagValues("response", response.tags)
      const ids =
        this.values.pollType === "singlechoice" ? selections.slice(0, 1) : uniq(selections)

      for (const id of ids) {
        const option = counts.get(id)

        if (option) {
          option.votes += 1
        }
      }
    }

    return {options, voters: latestByPubkey.size}
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [
      ...this.values.options.map(o => ["option", o.id, o.label]),
      ["polltype", this.values.pollType],
    ]

    if (this.values.endsAt != null) {
      tags.push(["endsAt", String(this.values.endsAt)])
    }

    for (const relay of this.values.relays) {
      tags.push(["relay", relay])
    }

    if (this.values.h) {
      tags.push(["h", this.values.h])
    }

    return {kind: this.kind, content: this.values.title, tags}
  }
}
