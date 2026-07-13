import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_ADMINS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-39001 room admins list.
export class RoomAdminsReader extends EventReader {
  readonly kind = ROOM_ADMINS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomAdminsWriter extends EventWriter<RoomAdminsReader> {
  readonly kind = ROOM_ADMINS
  readonly requiresRelays = true

  addPubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey]))
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    return this.dropTags(spec(["p"])).addTags(...uniq(pubkeys).map(pk => ["p", pk]))
  }
}

export const RoomAdmins = new KindFactory({
  reader: RoomAdminsReader,
  writer: RoomAdminsWriter,
})
