import {uniq, nth, uniqBy} from "@welshman/lib"
import {ROOM_ADD_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 room add-member op (kind 9000).
export class RoomAddMember extends EventReader {
  readonly kind = ROOM_ADD_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RoomAddMemberBuilder(this)
  }
}

export class RoomAddMemberBuilder extends EventBuilder<RoomAddMember> {
  readonly kind = ROOM_ADD_MEMBER

  pubkeyTags: string[][] = []

  constructor(readonly reader?: RoomAddMember) {
    super(reader)

    this.pubkeyTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  addPubkey(pubkey: string) {
    this.pubkeyTags = uniqBy(nth(1), [...this.pubkeyTags, ["p", pubkey]])

    return this
  }

  protected buildTags() {
    return this.pubkeyTags
  }
}
