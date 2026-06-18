import {uniq} from "@welshman/lib"
import {ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomMembershipValues = {
  pubkeys: string[]
}

export const makeRoomMembershipValues = (
  values: Partial<RoomMembershipValues> = {},
): RoomMembershipValues => ({
  pubkeys: [],
  ...values,
})

// NIP-29 moderation op for adding (kind 9000) or removing (kind 9001) room
// members. Regular (non-addressable) events carrying the affected pubkeys in "p"
// tags; the target group id is the base `group` ("h") behavior tag. Add and
// remove share this shape; each is its own concrete class fixing the kind.
//
// Flotilla's membership replay treats RoomAddMember => member, RoomRemoveMember
// => not a member.
export abstract class RoomMembershipOp extends DomainObject<RoomMembershipValues> {
  values = makeRoomMembershipValues()

  protected normalizeValues(values: Partial<RoomMembershipValues> = {}) {
    return makeRoomMembershipValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomMembershipValues> {
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

export class RoomAddMember extends RoomMembershipOp {
  readonly kind = ROOM_ADD_MEMBER
}

export class RoomRemoveMember extends RoomMembershipOp {
  readonly kind = ROOM_REMOVE_MEMBER
}
