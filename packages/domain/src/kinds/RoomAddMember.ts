import {
  uniq,
  spec,
  removeUndefined} from "@welshman/lib"
import {ROOM_ADD_MEMBER,
  getPubkeyTagValues,
} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-29 room add-member op (kind 9000).
export class RoomAddMemberReader extends EventReader {
  readonly kind = ROOM_ADD_MEMBER

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomAddMemberWriter extends EventWriter<RoomAddMemberReader> {
  readonly kind = ROOM_ADD_MEMBER
  readonly requiresRelays = true


  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RoomAddMember = new KindFactory({
  reader: RoomAddMemberReader,
  writer: RoomAddMemberWriter,
})
