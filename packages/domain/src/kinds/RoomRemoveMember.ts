import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 room remove-member op (kind 9001).
export class RoomRemoveMemberReader extends EventReader {
  readonly kind = ROOM_REMOVE_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomRemoveMemberBuilder extends EventBuilder<RoomRemoveMemberReader> {
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

export const RoomRemoveMember = new Kind({
  reader: RoomRemoveMemberReader,
  builder: RoomRemoveMemberBuilder,
  router: ContentRouter,
})
