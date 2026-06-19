import {uniq} from "@welshman/lib"
import {ROOM_CREATE_PERMISSION, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// Flotilla/NIP-29 extension: relay-authored grant of room-creation permission
// (kind 19004). The "p" tags list the pubkeys allowed to create rooms. Read-only
// in practice. Tags-only content.
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

  pubkeys: string[] = []

  constructor(readonly reader?: RoomCreatePermission) {
    super(reader)

    // Consume the represented "p" tags out of the carried-over extraTags so they
    // round-trip through the structured field below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    this.pubkeys = uniq(this.consumeTags("p").map(t => t[1]))
  }

  setPubkeys(pubkeys: string[]) {
    this.pubkeys = pubkeys

    return this
  }

  protected buildTags() {
    return uniq(this.pubkeys).map(pk => ["p", pk])
  }
}
