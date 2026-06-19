import {first, uniq} from "@welshman/lib"
import {ROOM_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-39002 relay-authored room member-list snapshot. Addressable, with
// the group id ("h") stored in the "d" tag and members listed as "p" tags.
// Tags-only content.
export class RoomMembers extends EventReader {
  readonly kind = ROOM_MEMBERS

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
    return new RoomMembersBuilder(this)
  }
}

export class RoomMembersBuilder extends EventBuilder<RoomMembers> {
  readonly kind = ROOM_MEMBERS

  h = ""
  members: string[] = []

  constructor(readonly reader?: RoomMembers) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const d = first(this.consumeTags("d"))

    this.h = d?.[1] || ""
    this.members = uniq(this.consumeTags("p").map(t => t[1]))
  }

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
