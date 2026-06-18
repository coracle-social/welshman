import {ROOM_JOIN, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type RoomJoinValues = {
  h: string
  claim?: string
  reason?: string
}

export const makeRoomJoinValues = (values: Partial<RoomJoinValues> = {}): RoomJoinValues => ({
  h: "",
  ...values,
})

// NIP-29 kind-9021 room join request. A regular (read-and-written) event
// carrying the target group id ("h") tag, an optional invite "claim" tag, and a
// free-text reason in the event content. Drives the membership state machine
// (ROOM_JOIN -> Pending/Granted) and the pending-join admin queue, grouped by
// h + pubkey. Tags-plus-content, so it extends DomainObject directly.
export class RoomJoin extends DomainObject<RoomJoinValues> {
  readonly kind = ROOM_JOIN
  values = makeRoomJoinValues()

  protected normalizeValues(values: Partial<RoomJoinValues> = {}) {
    return makeRoomJoinValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomJoinValues> {
    return {
      h: getTagValue("h", event.tags) || "",
      claim: getTagValue("claim", event.tags),
      reason: event.content || undefined,
    }
  }

  h() {
    return this.values.h
  }

  claim() {
    return this.values.claim
  }

  reason() {
    return this.values.reason
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [["h", this.values.h]]

    if (this.values.claim) {
      tags.push(["claim", this.values.claim])
    }

    return {
      kind: this.kind,
      tags,
      content: this.values.reason || "",
    }
  }
}
