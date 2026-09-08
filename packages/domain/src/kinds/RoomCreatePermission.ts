import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_CREATE_PERMISSION, hexTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// Flotilla/NIP-29 kind-19004 room-creation permission grant.
export class RoomCreatePermissionReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.event.tags))
  }

  canCreate(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }
}

export class RoomCreatePermissionWriter extends EventWriter<RoomCreatePermissionReader> {
  readonly requiresRelays = true

  addPubkey(pubkey: string, role?: string) {
    return this.dropTags(spec(["p", pubkey])).addTags(removeUndefined(["p", pubkey, role]))
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    return this.dropTags(spec(["p"])).addTags(...uniq(pubkeys).map(pk => ["p", pk]))
  }
}

export class RoomCreatePermissionQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomCreatePermission = new KindFactory({
  kind: ROOM_CREATE_PERMISSION,
  reader: RoomCreatePermissionReader,
  writer: RoomCreatePermissionWriter,
  query: RoomCreatePermissionQuery,
})
