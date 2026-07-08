import {
  RoomCreate,
  RoomDelete,
  RoomEdit,
  RoomJoin,
  RoomLeave,
  RoomAddMember,
  RoomRemoveMember,
} from "@welshman/domain"
import {Router} from "./router.js"
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
    this.app.use(Router).commandFromBuilder(RoomCreate.builder().setGroup(url, room.h))

  delete = (url: string, room: RoomMeta) =>
    this.app.use(Router).commandFromBuilder(RoomDelete.builder().setGroup(url, room.h))

  edit = (url: string, room: RoomMeta) => {
    const builder = RoomEdit.builder().setGroup(url, room.h)

    if (room.name) builder.setName(room.name)
    if (room.about) builder.setAbout(room.about)
    if (room.picture) builder.setPicture(room.picture, room.pictureMeta)

    builder
      .setClosed(Boolean(room.isClosed))
      .setHidden(Boolean(room.isHidden))
      .setPrivate(Boolean(room.isPrivate))
      .setRestricted(Boolean(room.isRestricted))
      .setLivekit(Boolean(room.livekit))

    return this.app.use(Router).commandFromBuilder(builder)
  }

  join = (url: string, room: RoomMeta) =>
    this.app.use(Router).commandFromBuilder(RoomJoin.builder().setGroup(url, room.h))

  leave = (url: string, room: RoomMeta) =>
    this.app.use(Router).commandFromBuilder(RoomLeave.builder().setGroup(url, room.h))

  addMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Router)
      .commandFromBuilder(RoomAddMember.builder().setGroup(url, room.h).addPubkey(pubkey))

  removeMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Router)
      .commandFromBuilder(RoomRemoveMember.builder().setGroup(url, room.h).addPubkey(pubkey))
}
