import {
  makeRoomCreateEvent,
  makeRoomDeleteEvent,
  makeRoomEditEvent,
  makeRoomJoinEvent,
  makeRoomLeaveEvent,
  makeRoomAddMemberEvent,
  makeRoomRemoveMemberEvent,
} from "@welshman/util"
import type {RoomMeta} from "@welshman/util"
import {Thunks} from "./thunk.js"
import type {ThunkOptions} from "./thunk.js"
import type {IClient} from "../client.js"

/**
 * NIP-29 relay-based group (room) management. Each method publishes the relevant
 * room event to the given relay as the client's user.
 */
export class Rooms {
  constructor(readonly ctx: IClient) {}

  private publish = (url: string, event: ThunkOptions["event"]) =>
    this.ctx.use(Thunks).publish({event, relays: [url]})

  create = (url: string, room: RoomMeta) => this.publish(url, makeRoomCreateEvent(room))

  delete = (url: string, room: RoomMeta) => this.publish(url, makeRoomDeleteEvent(room))

  edit = (url: string, room: RoomMeta) => this.publish(url, makeRoomEditEvent(room))

  join = (url: string, room: RoomMeta) => this.publish(url, makeRoomJoinEvent(room))

  leave = (url: string, room: RoomMeta) => this.publish(url, makeRoomLeaveEvent(room))

  addMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.publish(url, makeRoomAddMemberEvent(room, pubkey))

  removeMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.publish(url, makeRoomRemoveMemberEvent(room, pubkey))
}
