import {uniq} from "@welshman/lib"
import {RELAY_ADD_MEMBER, RELAY_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

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
  // The affected pubkeys, deduped.
  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  abstract builder(): RelayMembershipOpBuilder
}

// Shared write side: collect pubkeys, emit them as "p" tags.
export abstract class RelayMembershipOpBuilder extends EventBuilder<RelayMembershipOp> {
  pubkeys: string[] = []

  constructor(readonly reader?: RelayMembershipOp) {
    super(reader)

    this.pubkeys = uniq(this.consumeTags("p").map(t => t[1]))
  }

  addPubkey(pubkey: string) {
    this.pubkeys = uniq([...this.pubkeys, pubkey])

    return this
  }

  protected buildTags() {
    return this.pubkeys.map(pk => ["p", pk])
  }
}

export class RelayAddMember extends RelayMembershipOp {
  readonly kind = RELAY_ADD_MEMBER

  builder() {
    return new RelayAddMemberBuilder(this)
  }
}

export class RelayAddMemberBuilder extends RelayMembershipOpBuilder {
  readonly kind = RELAY_ADD_MEMBER
}

export class RelayRemoveMember extends RelayMembershipOp {
  readonly kind = RELAY_REMOVE_MEMBER

  builder() {
    return new RelayRemoveMemberBuilder(this)
  }
}

export class RelayRemoveMemberBuilder extends RelayMembershipOpBuilder {
  readonly kind = RELAY_REMOVE_MEMBER
}
