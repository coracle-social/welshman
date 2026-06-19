import {uniq, nth, uniqBy} from "@welshman/lib"
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

  pubkeyTags: string[][] = []

  constructor(readonly reader?: RoomCreatePermission) {
    super(reader)

    this.pubkeyTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  setPubkeys(pubkeys: string[]) {
    this.pubkeyTags = pubkeys.map(pk => ["p", pk])

    return this
  }

  protected buildTags() {
    return uniqBy(nth(1), this.pubkeyTags)
  }
}
