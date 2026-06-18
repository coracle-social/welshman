import {uniq} from "@welshman/lib"
import {ROOM_MEMBERS, getIdentifier, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomMembersValues = {
  h: string
  members: string[]
}

export const makeRoomMembersValues = (
  values: Partial<RoomMembersValues> = {},
): RoomMembersValues => ({
  h: "",
  members: [],
  ...values,
})

// NIP-29 kind-39002 relay-authored room member-list snapshot. Addressable, with
// the group id ("h") stored in the "d" tag and members listed as "p" tags.
// Tags-only content, so it extends DomainObject directly rather than the
// encryptable list base.
export class RoomMembers extends DomainObject<RoomMembersValues> {
  readonly kind = ROOM_MEMBERS
  values = makeRoomMembersValues()

  protected normalizeValues(values: Partial<RoomMembersValues> = {}) {
    return makeRoomMembersValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomMembersValues> {
    return {
      h: getIdentifier(event) || "",
      members: uniq(getPubkeyTagValues(event.tags)),
    }
  }

  h() {
    return this.values.h
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
    const tags: string[][] = [
      ["d", this.values.h],
      ...this.values.members.map(pk => ["p", pk]),
    ]

    return {kind: this.kind, tags, content: ""}
  }
}
