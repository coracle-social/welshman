import {ROOM_CREATE, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomCreateValues = {
  h: string
}

export const makeRoomCreateValues = (
  values: Partial<RoomCreateValues> = {},
): RoomCreateValues => ({
  h: "",
  ...values,
})

// NIP-29 kind-9007 create-room action op. A regular (write-primarily) event
// carrying only the target group id ("h") tag. Tags-only content, so it extends
// DomainObject directly rather than the encryptable list base.
export class RoomCreate extends DomainObject<RoomCreateValues> {
  readonly kind = ROOM_CREATE
  values = makeRoomCreateValues()

  protected normalizeValues(values: Partial<RoomCreateValues> = {}) {
    return makeRoomCreateValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomCreateValues> {
    return {
      h: getTagValue("h", event.tags) || "",
    }
  }

  h() {
    return this.values.h
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: [["h", this.values.h]],
      content: "",
    }
  }
}
