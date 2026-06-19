import {uniq} from "@welshman/lib"
import {ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 moderation op for adding (kind 9000) or removing (kind 9001) room
// members. Regular (non-addressable) events carrying the affected pubkeys in "p"
// tags; the target group id is the base `group` ("h") behavior tag. Add and
// remove share this shape; each is its own concrete reader/builder fixing the
// kind via a static field.
//
// Flotilla's membership replay treats RoomAddMember => member, RoomRemoveMember
// => not a member.
export abstract class RoomMembershipOp extends EventReader {
  protected reservedTagKeys() {
    return ["p"]
  }

  // The affected pubkeys, deduped.
  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  abstract builder(): RoomMembershipOpBuilder
}

// Shared write side: collect pubkeys, emit them as "p" tags. The target group id
// ("h") is set via the base group behavior tag.
export abstract class RoomMembershipOpBuilder extends EventBuilder {
  pubkeys: string[] = []

  addPubkey(pubkey: string) {
    this.pubkeys = uniq([...this.pubkeys, pubkey])

    return this
  }

  protected buildTags() {
    return this.pubkeys.map(pk => ["p", pk])
  }
}

export class RoomAddMember extends RoomMembershipOp {
  static kind = ROOM_ADD_MEMBER

  builder() {
    const builder = new RoomAddMemberBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RoomAddMemberBuilder extends RoomMembershipOpBuilder {
  static kind = ROOM_ADD_MEMBER
}

export class RoomRemoveMember extends RoomMembershipOp {
  static kind = ROOM_REMOVE_MEMBER

  builder() {
    const builder = new RoomRemoveMemberBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RoomRemoveMemberBuilder extends RoomMembershipOpBuilder {
  static kind = ROOM_REMOVE_MEMBER
}
