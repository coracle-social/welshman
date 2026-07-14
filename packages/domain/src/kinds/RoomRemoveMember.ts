import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_REMOVE_MEMBER, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 room remove-member op (kind 9001).
export class RoomRemoveMemberReader extends EventReader {
  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomRemoveMemberWriter extends EventWriter<RoomRemoveMemberReader> {
  readonly requiresRelays = true

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

export const RoomRemoveMember = new KindFactory({
  kind: ROOM_REMOVE_MEMBER,
  reader: RoomRemoveMemberReader,
  writer: RoomRemoveMemberWriter,
})
