import {uniq} from "@welshman/lib"
import {RELAY_MEMBERS, getTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RelayMembersValues = {
  members: string[]
}

export const makeRelayMembersValues = (
  values: Partial<RelayMembersValues> = {},
): RelayMembersValues => ({
  members: [],
  ...values,
})

// Flotilla relay-wide (space) member-list snapshot, replaceable kind 13534.
// Members are stored under "member" tags (tag[0] === "member"), NOT "p" tags,
// so parsing uses getTagValues("member", ...) rather than getPubkeyTagValues.
// Not addressable (no "d" tag); tags-only content, so it extends DomainObject
// directly rather than the encryptable list base.
export class RelayMembers extends DomainObject<RelayMembersValues> {
  readonly kind = RELAY_MEMBERS
  values = makeRelayMembersValues()

  protected normalizeValues(values: Partial<RelayMembersValues> = {}) {
    return makeRelayMembersValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RelayMembersValues> {
    return {
      members: uniq(getTagValues("member", event.tags)),
    }
  }

  members() {
    return this.values.members
  }

  isMember(pubkey: string) {
    return this.values.members.includes(pubkey)
  }

  addMember(pubkey: string) {
    this.values.members = uniq([...this.values.members, pubkey])

    return this
  }

  removeMember(pubkey: string) {
    this.values.members = this.values.members.filter(pk => pk !== pubkey)

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = this.values.members.map(pk => ["member", pk])

    return {kind: this.kind, tags, content: ""}
  }
}
