import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_ADD_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 room add-member op (kind 9000).
export class RoomAddMemberReader extends EventReader {
  readonly kind = ROOM_ADD_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomAddMemberBuilder extends EventBuilder<RoomAddMemberReader> {
  readonly kind = ROOM_ADD_MEMBER

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RoomAddMember = new Kind({
  reader: RoomAddMemberReader,
  builder: RoomAddMemberBuilder,
  router: ContentRouter,
})
