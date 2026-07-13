import {
  RoomCreate,
  RoomDelete,
  RoomEdit,
  RoomJoin,
  RoomLeave,
  RoomAddMember,
  RoomRemoveMember,
} from "@welshman/domain"
import {Domain} from "./domain.js"
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
 * room event and returns a `Command`. Routing is the domain's job: `setGroup(url,
 * id)` records the group's relay and the router sends the event there (only).
 */
export class Rooms {
  constructor(readonly app: IApp) {}

  create = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomCreate).setGroup(url, room.h))

  delete = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomDelete).setGroup(url, room.h))

  edit = (url: string, room: RoomMeta) => {
    const writer = this.app.use(Domain).writer(RoomEdit).setGroup(url, room.h)

    if (room.name) writer.setName(room.name)
    if (room.about) writer.setAbout(room.about)
    if (room.picture) writer.setPicture(room.picture, room.pictureMeta)

    writer
      .setClosed(Boolean(room.isClosed))
      .setHidden(Boolean(room.isHidden))
      .setPrivate(Boolean(room.isPrivate))
      .setRestricted(Boolean(room.isRestricted))
      .setLivekit(Boolean(room.livekit))

    return this.app.use(Domain).command(writer)
  }

  join = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomJoin).setGroup(url, room.h))

  leave = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomLeave).setGroup(url, room.h))

  addMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Domain)
      .command(this.app.use(Domain).writer(RoomAddMember).setGroup(url, room.h).addPubkey(pubkey))

  removeMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Domain)
      .command(
        this.app.use(Domain).writer(RoomRemoveMember).setGroup(url, room.h).addPubkey(pubkey),
      )
}
