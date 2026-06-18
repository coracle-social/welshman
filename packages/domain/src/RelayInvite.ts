import {RELAY_INVITE, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RelayInviteValues = {
  claim?: string
}

export const makeRelayInviteValues = (
  values: Partial<RelayInviteValues> = {},
): RelayInviteValues => ({
  ...values,
})

// NIP-29 kind-28935 ephemeral relay invite event. Its "claim" tag carries the
// invite code, which flotilla turns into a /join?r=&c= link. Flotilla only reads
// this event (see app/relays.ts requestRelayClaim), so `claim` is the sole field.
// Tags-only content, so it extends DomainObject directly.
export class RelayInvite extends DomainObject<RelayInviteValues> {
  readonly kind = RELAY_INVITE
  values = makeRelayInviteValues()

  protected normalizeValues(values: Partial<RelayInviteValues> = {}) {
    return makeRelayInviteValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RelayInviteValues> {
    return {
      claim: getTagValue("claim", event.tags),
    }
  }

  claim() {
    return this.values.claim
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: this.values.claim ? [["claim", this.values.claim]] : [],
      content: "",
    }
  }
}
