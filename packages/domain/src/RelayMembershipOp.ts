import {uniq} from "@welshman/lib"
import {RELAY_ADD_MEMBER, RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RelayMembershipValues = {
  pubkeys: string[]
}

export const makeRelayMembershipValues = (
  values: Partial<RelayMembershipValues> = {},
): RelayMembershipValues => ({
  pubkeys: [],
  ...values,
})

// Relay/space-level moderation op carrying the affected pubkeys in "p" tags. Add
// (kind 8000) and remove (kind 8001) are regular (non-addressable) events that
// share this shape; each is its own concrete class fixing the kind.
//
// Flotilla's deriveUserSpaceMembershipStatus replays this history (RelayAddMember
// => isMember true, RelayRemoveMember => isMember false) when no RELAY_MEMBERS
// snapshot is available.
export abstract class RelayMembershipOp extends DomainObject<RelayMembershipValues> {
  values = makeRelayMembershipValues()

  protected normalizeValues(values: Partial<RelayMembershipValues> = {}) {
    return makeRelayMembershipValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RelayMembershipValues> {
    return {pubkeys: uniq(getPubkeyTagValues(event.tags))}
  }

  pubkeys() {
    return this.values.pubkeys
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: this.values.pubkeys.map(pk => ["p", pk]),
      content: "",
    }
  }
}

export class RelayAddMember extends RelayMembershipOp {
  readonly kind = RELAY_ADD_MEMBER
}

export class RelayRemoveMember extends RelayMembershipOp {
  readonly kind = RELAY_REMOVE_MEMBER
}
