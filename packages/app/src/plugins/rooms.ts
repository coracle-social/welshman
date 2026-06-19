import {
  RoomCreateBuilder,
  RoomDeleteBuilder,
  RoomEditBuilder,
  RoomJoinBuilder,
  RoomLeaveBuilder,
  RoomAddMemberBuilder,
  RoomRemoveMemberBuilder,
} from "@welshman/domain"
import {Thunks} from "./thunk.js"
import type {ThunkOptions} from "./thunk.js"
import type {IApp} from "../app.js"

// Room metadata used when publishing NIP-29 room events. `h` is the group id.
export type RoomMeta = {
  h: string
  name?: string
  about?: string
  picture?: string
  pictureMeta?: string[]
  isClosed?: boolean
  isHidden?: boolean
  isPrivate?: boolean
  isRestricted?: boolean
  livekit?: boolean
}

/**
 * NIP-29 relay-based group (room) management. Each method publishes the relevant
 * room event to the given relay as the app's user.
 */
export class Rooms {
  constructor(readonly app: IApp) {}

  private publish = (url: string, event: ThunkOptions["event"]) =>
    this.app.use(Thunks).publish({event, relays: [url]})

  create = async (url: string, room: RoomMeta) =>
    this.publish(url, await new RoomCreateBuilder().setGroup(room.h).toTemplate())

  delete = async (url: string, room: RoomMeta) =>
    this.publish(url, await new RoomDeleteBuilder().setGroup(room.h).toTemplate())

  edit = async (url: string, room: RoomMeta) => {
    const builder = new RoomEditBuilder().setGroup(room.h)

    if (room.name) builder.setName(room.name)
    if (room.about) builder.setAbout(room.about)
    if (room.picture) builder.setPicture(room.picture, room.pictureMeta)

    builder
      .setClosed(Boolean(room.isClosed))
      .setHidden(Boolean(room.isHidden))
      .setPrivate(Boolean(room.isPrivate))
      .setRestricted(Boolean(room.isRestricted))
      .setLivekit(Boolean(room.livekit))

    return this.publish(url, await builder.toTemplate())
  }

  join = async (url: string, room: RoomMeta) =>
    this.publish(url, await new RoomJoinBuilder().setGroup(room.h).toTemplate())

  leave = async (url: string, room: RoomMeta) =>
    this.publish(url, await new RoomLeaveBuilder().setGroup(room.h).toTemplate())

  addMember = async (url: string, room: RoomMeta, pubkey: string) =>
    this.publish(url, await new RoomAddMemberBuilder().setGroup(room.h).addPubkey(pubkey).toTemplate())

  removeMember = async (url: string, room: RoomMeta, pubkey: string) =>
    this.publish(
      url,
      await new RoomRemoveMemberBuilder().setGroup(room.h).addPubkey(pubkey).toTemplate(),
    )
}
