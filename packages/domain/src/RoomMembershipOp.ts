import {uniq} from "@welshman/lib"
import {ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER, getTagValue, getPubkeyTagValues} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {DomainObject} from "./base.js"

export type RoomMembershipOpValues = {
  kind: number
  h: string
  pubkeys: string[]
}

export const makeRoomMembershipOpValues = (
  values: Partial<RoomMembershipOpValues> = {},
): RoomMembershipOpValues => ({
  kind: ROOM_ADD_MEMBER,
  h: "",
  pubkeys: [],
  ...values,
})

export const makeRoomAddMember = (h: string, pubkeys: string[]) =>
  RoomMembershipOp.init({kind: ROOM_ADD_MEMBER, h, pubkeys})

export const makeRoomRemoveMember = (h: string, pubkeys: string[]) =>
  RoomMembershipOp.init({kind: ROOM_REMOVE_MEMBER, h, pubkeys})

// NIP-29 moderation op for adding (kind 9000) or removing (kind 9001) room
// members. These are regular (non-addressable) events carrying the group id in
// the "h" tag and the affected pubkeys in "p" tags. The two kinds share an
// identical shape, so they're merged into one kind-discriminated class.
//
// Because the base DomainObject treats `kind` as a fixed value and asserts
// event.kind === this.kind in parse(), `kind` is a mutable instance field here:
// it's seeded from values.kind in normalizeValues, and parse() is overridden to
// adopt the event's kind before normalizing.
export class RoomMembershipOp extends DomainObject<RoomMembershipOpValues> {
  kind = ROOM_ADD_MEMBER
  values = makeRoomMembershipOpValues()

  protected normalizeValues(values: Partial<RoomMembershipOpValues> = {}) {
    const normalized = makeRoomMembershipOpValues(values)

    this.kind = normalized.kind

    return normalized
  }

  protected parseEvent(event: TrustedEvent): Partial<RoomMembershipOpValues> {
    return {
      kind: event.kind,
      h: getTagValue("h", event.tags) || "",
      pubkeys: uniq(getPubkeyTagValues(event.tags)),
    }
  }

  async parse(event: TrustedEvent, signer?: ISigner) {
    this.event = event
    this.kind = event.kind
    this.values = this.normalizeValues(await this.parseEvent(event, signer))

    return this
  }

  h() {
    return this.values.h
  }

  pubkeys() {
    return this.values.pubkeys
  }

  isAdd() {
    return this.kind === ROOM_ADD_MEMBER
  }

  async toTemplate(): Promise<EventTemplate> {
    const tags: string[][] = [
      ["h", this.values.h],
      ...this.values.pubkeys.map(pk => ["p", pk]),
    ]

    return {kind: this.kind, tags, content: ""}
  }
}
