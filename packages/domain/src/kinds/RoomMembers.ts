import {uniq, spec, removeUndefined} from "@welshman/lib"
import {ROOM_MEMBERS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-29 kind-39002 room members list.
export class RoomMembersReader extends EventReader {
  readonly kind = ROOM_MEMBERS

  members() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  isMember(pubkey: string) {
    return this.members().includes(pubkey)
  }
}

export class RoomMembersBuilder extends EventBuilder<RoomMembersReader> {
  readonly kind = ROOM_MEMBERS

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

export const RoomMembers = new Kind({
  reader: RoomMembersReader,
  builder: RoomMembersBuilder,
  router: OutboxRouter,
})
