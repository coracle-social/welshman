import {spec} from "@welshman/lib"
import {
  ROOM_META,
  ROOM_DELETE,
  ROOM_CREATE,
  ROOM_EDIT_META,
  ROOM_JOIN,
  ROOM_LEAVE,
  ROOM_ADD_MEMBER,
  ROOM_REMOVE_MEMBER,
} from "./Kinds.js"
import {makeEvent, TrustedEvent, getIdentifier} from "./Events.js"
import {getTag, getTagValue} from "./Tags.js"

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
  noText?: boolean
  livekit?: boolean
  event?: TrustedEvent
}

export type PublishedRoomMeta = Omit<RoomMeta, "event"> & {
  event: TrustedEvent
}

const vowels = "a,e,i,o,u,ay,ey,oy,ou,ia,ea,ough,oo,ee,argh".split(",")

const consonants =
  "p,b,t,d,k,g,ch,sh,th,f,v,s,z,l,r,m,n,pl,bl,cl,gl,pr,br,tr,dr,kr,gr,fl,sl,fr,thr,str,sk,sp,st".split(
    ",",
  )

export const generateH = () => {
  const n = (6 + Math.random() * 2) | 0
  const s = [consonants, vowels]

  if (Math.random() < 0.5) {
    s.reverse()
  }

  return (
    Array.from({length: n}, (_, i) =>
      s[i % 2].splice((Math.random() * s[i % 2].length) | 0, 1),
    ).join("") +
    (1 + Math.floor(Math.random() * 9))
  )
}

export const makeRoomMeta = (room: Partial<RoomMeta> = {}): RoomMeta => {
  return {
    h: room.h ?? generateH(),
    ...room,
  }
}

export const readRoomMeta = (event: TrustedEvent): PublishedRoomMeta => {
  if (event.kind !== ROOM_META) {
    throw new Error("Invalid group meta event")
  }

  const h = getIdentifier(event)

  if (!h) {
    throw new Error("Group meta event had no d tag")
  }

  return {
    h,
    event,
    name: getTagValue("name", event.tags),
    about: getTagValue("about", event.tags),
    picture: getTagValue("picture", event.tags),
    pictureMeta: getTag("picture", event.tags)?.slice(2),
    isClosed: event.tags.some(spec(["closed"])),
    isHidden: event.tags.some(spec(["hidden"])),
    isPrivate: event.tags.some(spec(["private"])),
    isRestricted: event.tags.some(spec(["restricted"])),
    noText: event.tags.some(spec(["no-text"])),
    livekit: event.tags.some(spec(["livekit"])),
  }
}

export const makeRoomCreateEvent = (room: RoomMeta) =>
  makeEvent(ROOM_CREATE, {tags: [["h", room.h]]})

export const makeRoomDeleteEvent = (room: RoomMeta) =>
  makeEvent(ROOM_DELETE, {tags: [["h", room.h]]})

export const makeRoomEditEvent = (room: RoomMeta) => {
  const tags = [["h", room.h]]

  if (room.name) tags.push(["name", room.name])
  if (room.about) tags.push(["about", room.about])

  if (room.picture) {
    const tag = ["picture", room.picture]

    if (room.pictureMeta) {
      tag.push(...room.pictureMeta)
    }

    tags.push(tag)
  }

  if (room.isClosed) tags.push(["closed"])
  if (room.isHidden) tags.push(["hidden"])
  if (room.isPrivate) tags.push(["private"])
  if (room.isRestricted) tags.push(["restricted"])
  if (room.noText) tags.push(["no-text"])
  if (room.livekit) tags.push(["livekit"])

  if (room.event) {
    for (const t of room.event.tags) {
      if (tags.some(spec(t.slice(0, 1)))) continue
      if (["closed", "hidden", "private", "restricted", "no-text", "livekit"].includes(t[0]))
        continue

      tags.push(t)
    }
  }

  return makeEvent(ROOM_EDIT_META, {tags})
}

export const makeRoomJoinEvent = (room: RoomMeta) => makeEvent(ROOM_JOIN, {tags: [["h", room.h]]})

export const makeRoomLeaveEvent = (room: RoomMeta) => makeEvent(ROOM_LEAVE, {tags: [["h", room.h]]})

export const makeRoomAddMemberEvent = (room: RoomMeta, pubkey: string) =>
  makeEvent(ROOM_ADD_MEMBER, {
    tags: [
      ["h", room.h],
      ["p", pubkey],
    ],
  })

export const makeRoomRemoveMemberEvent = (room: RoomMeta, pubkey: string) =>
  makeEvent(ROOM_REMOVE_MEMBER, {
    tags: [
      ["h", room.h],
      ["p", pubkey],
    ],
  })
