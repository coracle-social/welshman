import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_ADMINS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-39001 room admins list.
export class RoomAdminsReader extends EventReader {
  readonly kind = ROOM_ADMINS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }
}

export class RoomAdminsBuilder extends EventBuilder<RoomAdminsReader> {
  readonly kind = ROOM_ADMINS

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

export const RoomAdmins = new Kind({
  reader: RoomAdminsReader,
  builder: RoomAdminsBuilder,
  router: OutboxRouter,
})
