import {uniq} from "@welshman/lib"
import {ROOM_CREATE_PERMISSION, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// Flotilla/NIP-29 extension: relay-authored grant of room-creation permission
// (kind 19004). The "p" tags list the pubkeys allowed to create rooms. Read-only
// in practice. Tags-only content.
export class RoomCreatePermission extends EventReader {
  static kind = ROOM_CREATE_PERMISSION

  protected reservedTagKeys() {
    return ["p"]
  }

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  canCreate(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    const builder = new RoomCreatePermissionBuilder()

    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RoomCreatePermissionBuilder extends EventBuilder {
  static kind = ROOM_CREATE_PERMISSION

  pubkeys: string[] = []

  setPubkeys(pubkeys: string[]) {
    this.pubkeys = pubkeys

    return this
  }

  protected buildTags() {
    return uniq(this.pubkeys).map(pk => ["p", pk])
  }
}
