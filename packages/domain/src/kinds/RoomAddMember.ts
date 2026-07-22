import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_ADD_MEMBER, hexTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 room add-member op (kind 9000).
export class RoomAddMemberReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.event.tags))
  }
}

export class RoomAddMemberWriter extends EventWriter<RoomAddMemberReader> {
  readonly requiresRelays = true

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }
}

export const RoomAddMember = new KindFactory({
  kind: ROOM_ADD_MEMBER,
  reader: RoomAddMemberReader,
  writer: RoomAddMemberWriter,
})
