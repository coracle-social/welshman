import {uniq} from "@welshman/lib"
import {POLL_RESPONSE, getTagValue, getTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type PollResponseValues = {
  pollId: string
  selections: string[]
}

export const makePollResponseValues = (
  values: Partial<PollResponseValues> = {},
): PollResponseValues => ({
  pollId: "",
  selections: [],
  ...values,
})

// NIP-88 kind-1018 poll vote. Empty content; the target poll is referenced via
// an "e" tag and each chosen option id lives in its own "response" tag. Tags-only
// content, so it extends DomainObject directly rather than the encryptable list base.
export class PollResponse extends DomainObject<PollResponseValues> {
  readonly kind = POLL_RESPONSE
  values = makePollResponseValues()

  protected normalizeValues(values: Partial<PollResponseValues> = {}) {
    return makePollResponseValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<PollResponseValues> {
    return {
      pollId: getTagValue("e", event.tags) || "",
      selections: getTagValues("response", event.tags),
    }
  }

  pollId() {
    return this.values.pollId
  }

  selections(pollType?: "singlechoice" | "multiplechoice") {
    if (pollType === "singlechoice") {
      return this.values.selections.slice(0, 1)
    }

    return uniq(this.values.selections)
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      content: "",
      tags: [
        ["e", this.values.pollId],
        ...this.values.selections.map(id => ["response", id]),
      ],
    }
  }
}
