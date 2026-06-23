import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_CREATE_PERMISSION, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla/NIP-29 kind-19004 room-creation permission grant.
export class RoomCreatePermission extends EventReader {
  readonly kind = ROOM_CREATE_PERMISSION

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  canCreate(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return new RoomCreatePermissionBuilder(this)
  }
}

export class RoomCreatePermissionBuilder extends EventBuilder<RoomCreatePermission> {
  readonly kind = ROOM_CREATE_PERMISSION

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
