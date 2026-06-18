import {ROOM_DELETE, getTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomDeleteValues = {
  hs: string[]
}

export const makeRoomDeleteValues = (
  values: Partial<RoomDeleteValues> = {},
): RoomDeleteValues => ({
  hs: [],
  ...values,
})

// NIP-29 kind-9008 delete-room/tombstone op. A regular event that may carry
// MULTIPLE group id ("h") tags, allowing a single delete event to tombstone
// several rooms at once. Tags-only content, so it extends DomainObject directly
// rather than the encryptable list base.
export class RoomDelete extends DomainObject<RoomDeleteValues> {
  readonly kind = ROOM_DELETE
  values = makeRoomDeleteValues()

  protected normalizeValues(values: Partial<RoomDeleteValues> = {}) {
    return makeRoomDeleteValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomDeleteValues> {
    return {
      hs: getTagValues("h", event.tags),
    }
  }

  hs() {
    return this.values.hs
  }

  h() {
    return this.values.hs[0]
  }

  addRoom(h: string) {
    if (!this.values.hs.includes(h)) {
      this.values.hs.push(h)
    }

    return this
  }

  removeRoom(h: string) {
    this.values.hs = this.values.hs.filter(value => value !== h)

    return this
  }

  async toTemplate(): Promise<EventTemplate> {
    return {
      kind: this.kind,
      tags: this.values.hs.map(h => ["h", h]),
      content: "",
    }
  }
}
