import {uniq, spec, removeUndefined} from "@welshman/lib"
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

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    return this.dropTags(spec(["p"])).addTags(...pubkeys.map(pk => ["p", pk]))
  }
}
