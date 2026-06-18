import {uniq} from "@welshman/lib"
import {ROOM_CREATE_PERMISSION, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomCreatePermissionValues = {
  pubkeys: string[]
}

export const makeRoomCreatePermissionValues = (
  values: Partial<RoomCreatePermissionValues> = {},
): RoomCreatePermissionValues => ({
  pubkeys: [],
  ...values,
})

// Flotilla/NIP-29 extension: relay-authored grant of room-creation permission
// (kind 19004). The "p" tags list the pubkeys allowed to create rooms. Read-only
// in practice. Tags-only content, so it extends DomainObject directly rather than
// the encryptable list base.
export class RoomCreatePermission extends DomainObject<RoomCreatePermissionValues> {
  readonly kind = ROOM_CREATE_PERMISSION
  values = makeRoomCreatePermissionValues()

  protected normalizeValues(values: Partial<RoomCreatePermissionValues> = {}) {
    return makeRoomCreatePermissionValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomCreatePermissionValues> {
    return {
      pubkeys: uniq(getPubkeyTagValues(event.tags)),
    }
  }

  pubkeys() {
    return this.values.pubkeys
  }

  canCreate(pubkey: string) {
    return this.values.pubkeys.includes(pubkey)
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: this.values.pubkeys.map(pk => ["p", pk]),
      content: "",
    }
  }
}
