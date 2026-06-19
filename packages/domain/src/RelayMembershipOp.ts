import {uniq} from "@welshman/lib"
import {RELAY_ADD_MEMBER, RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// Relay/space-level moderation op for adding (kind 8000) or removing (kind 8001)
// members. Regular (non-addressable) events carrying the affected pubkeys in "p"
// tags. Unlike RoomMembershipOp these are relay-scoped, not room-scoped, so there
// is no group ("h") tag — just the "p" tags. Add and remove share this shape;
// each is its own concrete reader/builder fixing the kind via a static field.
//
// Flotilla's deriveUserSpaceMembershipStatus replays this history (RelayAddMember
// => isMember true, RelayRemoveMember => isMember false) when no RELAY_MEMBERS
// snapshot is available.
export abstract class RelayMembershipOp extends EventReader {
  protected reservedTagKeys() {
    return ["p"]
  }

  // The affected pubkeys, deduped.
  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  abstract builder(): RelayMembershipOpBuilder
}

// Shared write side: collect pubkeys, emit them as "p" tags.
export abstract class RelayMembershipOpBuilder extends EventBuilder {
  pubkeys: string[] = []

  addPubkey(pubkey: string) {
    this.pubkeys = uniq([...this.pubkeys, pubkey])

    return this
  }

  protected buildTags() {
    return this.pubkeys.map(pk => ["p", pk])
  }
}

export class RelayAddMember extends RelayMembershipOp {
  static kind = RELAY_ADD_MEMBER

  builder() {
    const builder = new RelayAddMemberBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RelayAddMemberBuilder extends RelayMembershipOpBuilder {
  static kind = RELAY_ADD_MEMBER
}

export class RelayRemoveMember extends RelayMembershipOp {
  static kind = RELAY_REMOVE_MEMBER

  builder() {
    const builder = new RelayRemoveMemberBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RelayRemoveMemberBuilder extends RelayMembershipOpBuilder {
  static kind = RELAY_REMOVE_MEMBER
}
