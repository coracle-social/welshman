import {RELAY_JOIN, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RelayJoinValues = {
  claim?: string
  reason?: string
}

export const makeRelayJoinValues = (values: Partial<RelayJoinValues> = {}): RelayJoinValues => ({
  ...values,
})

// Ephemeral kind-28934 relay/space join request. Both written (the join flow)
// and read (membership status): it carries an optional invite "claim" tag and a
// free-text reason in the event content, driving the space membership state
// machine (RELAY_JOIN -> Pending/Granted). Tags-plus-content, so it extends
// DomainObject directly.
export class RelayJoin extends DomainObject<RelayJoinValues> {
  readonly kind = RELAY_JOIN
  values = makeRelayJoinValues()

  protected normalizeValues(values: Partial<RelayJoinValues> = {}) {
    return makeRelayJoinValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RelayJoinValues> {
    return {
      claim: getTagValue("claim", event.tags),
      reason: event.content || undefined,
    }
  }

  claim() {
    return this.values.claim
  }

  reason() {
    return this.values.reason
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = []

    if (this.values.claim) {
      tags.push(["claim", this.values.claim])
    }

    return {
      kind: this.kind,
      tags,
      content: this.values.reason || "",
    }
  }
}
