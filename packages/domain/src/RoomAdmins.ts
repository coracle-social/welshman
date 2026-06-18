import {uniq} from "@welshman/lib"
import {ROOM_ADMINS, getIdentifier, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomAdminsValues = {
  h: string
  admins: string[]
}

export const makeRoomAdminsValues = (
  values: Partial<RoomAdminsValues> = {},
): RoomAdminsValues => ({
  h: "",
  admins: [],
  ...values,
})

// NIP-29 kind-39001 relay-generated room admin list. Addressable, with the group
// id ("h") stored in the "d" tag and admins as "p" tags. Tags-only content, so it
// extends DomainObject directly rather than the encryptable list base.
export class RoomAdmins extends DomainObject<RoomAdminsValues> {
  readonly kind = ROOM_ADMINS
  values = makeRoomAdminsValues()

  protected normalizeValues(values: Partial<RoomAdminsValues> = {}) {
    return makeRoomAdminsValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomAdminsValues> {
    return {
      h: getIdentifier(event) || "",
      admins: uniq(getPubkeyTagValues(event.tags)),
    }
  }

  h() {
    return this.values.h
  }

  admins() {
    return this.values.admins
  }

  isAdmin(pubkey: string) {
    return this.values.admins.includes(pubkey)
  }

  addAdmin(pubkey: string) {
    if (!this.values.admins.includes(pubkey)) {
      this.values.admins.push(pubkey)
    }

    return this
  }

  removeAdmin(pubkey: string) {
    this.values.admins = this.values.admins.filter(pk => pk !== pubkey)

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [
      ["d", this.values.h],
      ...this.values.admins.map(pk => ["p", pk]),
    ]

    return {kind: this.kind, tags, content: ""}
  }
}
