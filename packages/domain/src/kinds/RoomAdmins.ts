import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_ADMINS, hexTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-39001 room admins list.
export class RoomAdminsReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.event.tags))
  }
}

export class RoomAdminsWriter extends EventWriter<RoomAdminsReader> {
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

export class RoomAdminsQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomAdmins = new KindFactory({
  kind: ROOM_ADMINS,
  reader: RoomAdminsReader,
  writer: RoomAdminsWriter,
  query: RoomAdminsQuery,
})
