import {ROOM_LEAVE, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomLeaveValues = {
  h: string
}

export const makeRoomLeaveValues = (values: Partial<RoomLeaveValues> = {}): RoomLeaveValues => ({
  h: "",
  ...values,
})

// NIP-29 kind-9022 room leave op, the counterpart to RoomJoin. A regular event
// carrying the target group id ("h") tag, which resets the membership state
// machine (ROOM_LEAVE -> Initial). Tags-only, so it extends DomainObject directly.
export class RoomLeave extends DomainObject<RoomLeaveValues> {
  readonly kind = ROOM_LEAVE
  values = makeRoomLeaveValues()

  protected normalizeValues(values: Partial<RoomLeaveValues> = {}) {
    return makeRoomLeaveValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomLeaveValues> {
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
