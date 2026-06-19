import {nth, nthNe, uniq, uniqBy} from "@welshman/lib"
import {ROOM_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-39002 room members list.
export class RoomMembers extends EventReader {
  readonly kind = ROOM_MEMBERS

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

  memberTags: string[][] = []

  constructor(readonly reader?: RoomMembers) {
    super(reader)

    this.memberTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  addMember(pubkey: string) {
    this.memberTags = uniqBy(nth(1), [...this.memberTags, ["p", pubkey]])

    return this
  }

  removeMember(pubkey: string) {
    this.memberTags = this.memberTags.filter(nthNe(1, pubkey))

    return this
  }

  protected buildTags() {
    return this.memberTags
  }
}
