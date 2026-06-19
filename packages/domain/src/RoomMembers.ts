import {uniq} from "@welshman/lib"
import {ROOM_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-39002 relay-authored room member-list snapshot. Addressable, with
// the group id ("h") stored in the "d" tag and members listed as "p" tags.
// Tags-only content.
export class RoomMembers extends EventReader {
  static kind = ROOM_MEMBERS

  protected validate() {
    if (!this.identifier()) {
      throw new Error("RoomMembers requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "p"]
  }

  // The group id is the addressable identifier (the "d" tag).
  h() {
    return this.identifier()
  }

  members() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  isMember(pubkey: string) {
    return this.members().includes(pubkey)
  }

  builder() {
    const builder = new RoomMembersBuilder()

    builder.h = this.identifier() || ""
    builder.members = this.members()

    return this.seedBuilder(builder)
  }
}

export class RoomMembersBuilder extends EventBuilder {
  static kind = ROOM_MEMBERS

  h = ""
  members: string[] = []

  addMember(pubkey: string) {
    this.members = uniq([...this.members, pubkey])

    return this
  }

  removeMember(pubkey: string) {
    this.members = this.members.filter(pk => pk !== pubkey)

    return this
  }

  protected validate() {
    if (!this.h) {
      throw new Error("RoomMembers requires an h/d identifier")
    }
  }

  protected buildTags() {
    return [["d", this.h], ...this.members.map(pk => ["p", pk])]
  }
}
