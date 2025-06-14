import {randomId, nthNe} from "@welshman/lib"
import {
  ROOM_META,
  ROOM_DELETE,
  ROOM_CREATE,
  ROOM_EDIT_META,
  ROOM_JOIN,
  ROOM_LEAVE,
} from "./Kinds.js"
import {makeEvent, TrustedEvent, getIdentifier} from "./Events.js"

export type RoomMeta = {
  id: string
  tags: string[][]
  event?: TrustedEvent
}

export type PublishedRoomMeta = Omit<RoomMeta, "event"> & {
  event: TrustedEvent
}

export const makeRoomMeta = (room: Partial<RoomMeta> = {}): RoomMeta => ({
  id: randomId(),
  tags: [],
  ...room,
})

export const readRoomMeta = (event: TrustedEvent): PublishedRoomMeta => {
  if (event.kind !== ROOM_META) {
    throw new Error("Invalid group meta event")
  }

  const id = getIdentifier(event)

  if (!id) {
    throw new Error("Group meta event had no d tag")
  }

  const tags = event.tags.filter(nthNe(0, "d"))

  return {id, tags, event}
}

export const makeRoomCreateEvent = (room: RoomMeta) =>
  makeEvent(ROOM_CREATE, {tags: [["h", room.id]]})

export const makeRoomDeleteEvent = (room: RoomMeta) =>
  makeEvent(ROOM_DELETE, {tags: [["h", room.id]]})

export const makeRoomEditEvent = (room: RoomMeta) =>
  makeEvent(ROOM_EDIT_META, {tags: [["h", room.id], ...room.tags]})

export const makeRoomJoinEvent = (room: RoomMeta) => makeEvent(ROOM_JOIN, {tags: [["h", room.id]]})

export const makeRoomLeaveEvent = (room: RoomMeta) =>
  makeEvent(ROOM_LEAVE, {tags: [["h", room.id]]})
