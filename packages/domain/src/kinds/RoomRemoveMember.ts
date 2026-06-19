import {uniq, nth, uniqBy} from "@welshman/lib"
import {ROOM_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 room remove-member op (kind 9001).
export class RoomRemoveMember extends EventReader {
  readonly kind = ROOM_REMOVE_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RoomRemoveMemberBuilder(this)
  }
}

export class RoomRemoveMemberBuilder extends EventBuilder<RoomRemoveMember> {
  readonly kind = ROOM_REMOVE_MEMBER

  pubkeyTags: string[][] = []

  constructor(readonly reader?: RoomRemoveMember) {
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
