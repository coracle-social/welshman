import {
  RoomCreateBuilder,
  RoomDeleteBuilder,
  RoomEditBuilder,
  RoomJoinBuilder,
  RoomLeaveBuilder,
  RoomAddMemberBuilder,
  RoomRemoveMemberBuilder,
} from "@welshman/domain"
import type {EventTemplate} from "@welshman/util"
import {Command} from "../command.js"
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
 * NIP-29 relay-based group (room) management. Each method builds the relevant
 * room event and returns a `Command` targeting the given relay, for the
 * caller to publish.
 */
export class Rooms {
  constructor(readonly app: IApp) {}

  private command = (url: string, event: EventTemplate) => new Command(this.app, event, [url])

  create = async (url: string, room: RoomMeta) =>
    this.command(url, await new RoomCreateBuilder().setGroup(room.h).toTemplate())

  delete = async (url: string, room: RoomMeta) =>
    this.command(url, await new RoomDeleteBuilder().setGroup(room.h).toTemplate())

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

    return this.command(url, await builder.toTemplate())
  }

  join = async (url: string, room: RoomMeta) =>
    this.command(url, await new RoomJoinBuilder().setGroup(room.h).toTemplate())

  leave = async (url: string, room: RoomMeta) =>
    this.command(url, await new RoomLeaveBuilder().setGroup(room.h).toTemplate())

  addMember = async (url: string, room: RoomMeta, pubkey: string) =>
    this.command(
      url,
      await new RoomAddMemberBuilder().setGroup(room.h).addPubkey(pubkey).toTemplate(),
    )

  removeMember = async (url: string, room: RoomMeta, pubkey: string) =>
    this.command(
      url,
      await new RoomRemoveMemberBuilder().setGroup(room.h).addPubkey(pubkey).toTemplate(),
    )
}
