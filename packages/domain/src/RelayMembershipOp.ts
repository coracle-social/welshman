import {uniq} from "@welshman/lib"
import {RELAY_ADD_MEMBER, RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {DomainObject} from "./base.js"

export type RelayMembershipOpValues = {
  kind: number
  pubkeys: string[]
}

export const makeRelayMembershipOpValues = (
  values: Partial<RelayMembershipOpValues> = {},
): RelayMembershipOpValues => ({
  kind: RELAY_ADD_MEMBER,
  pubkeys: [],
  ...values,
})

export const makeRelayAddMember = (pubkeys: string[]) =>
  RelayMembershipOp.init({kind: RELAY_ADD_MEMBER, pubkeys})

export const makeRelayRemoveMember = (pubkeys: string[]) =>
  RelayMembershipOp.init({kind: RELAY_REMOVE_MEMBER, pubkeys})

// Relay/space-level moderation op for adding (kind 8000) or removing (kind 8001)
// members. These are regular (non-addressable) events carrying the affected
// pubkeys in "p" tags. The two kinds share an identical shape, so they're merged
// into one kind-discriminated class.
//
// Flotilla's deriveUserSpaceMembershipStatus replays this history (RELAY_ADD_MEMBER
// => isMember true, RELAY_REMOVE_MEMBER => isMember false) when no RELAY_MEMBERS
// snapshot is available.
//
// Because the base DomainObject treats `kind` as a fixed value and asserts
// event.kind === this.kind in parse(), `kind` is a mutable instance field here:
// it's seeded from values.kind in normalizeValues, and parse() is overridden to
// adopt the event's kind before normalizing.
export class RelayMembershipOp extends DomainObject<RelayMembershipOpValues> {
  kind = RELAY_ADD_MEMBER
  values = makeRelayMembershipOpValues()

  protected normalizeValues(values: Partial<RelayMembershipOpValues> = {}) {
    const normalized = makeRelayMembershipOpValues(values)

    this.kind = normalized.kind

    return normalized
  }

  protected parseEvent(event: TrustedEvent): Partial<RelayMembershipOpValues> {
    return {
      kind: event.kind,
      pubkeys: uniq(getPubkeyTagValues(event.tags)),
    }
  }

  async parse(event: TrustedEvent, signer?: ISigner) {
    this.event = event
    this.kind = event.kind
    this.values = this.normalizeValues(await this.parseEvent(event, signer))

    return this
  }

  pubkeys() {
    return this.values.pubkeys
  }

  isAdd() {
    return this.kind === RELAY_ADD_MEMBER
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: this.values.pubkeys.map(pk => ["p", pk]),
      content: "",
    }
  }
}
