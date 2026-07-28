import {gt} from "@welshman/lib"
import {ROOM_META, ROOM_MEMBERS, ROOM_ADMINS} from "@welshman/util"
import {
  RoomCreate,
  RoomDelete,
  RoomEdit,
  RoomJoin,
  RoomLeave,
  RoomAddMember,
  RoomRemoveMember,
  RoomMeta as RoomMetaKind,
  RoomMembers,
  RoomAdmins,
  RoomMetaReader,
  RoomMembersReader,
  RoomAdminsReader,
} from "@welshman/domain"
import {LoadableMapPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Domain} from "./domain.js"
import {Network} from "./network.js"
import {Relays} from "./relays.js"

// NIP-29 group metadata (kinds 39000–39002) is addressable per group but hosted
// on a specific relay, so the same group id can exist independently on many
// relays. Key it by `${url}'${group}` (the `'` separator matches flotilla's
// room-id convention; relay urls never contain it).
export const makeGroupKey = (url: string, group: string) => `${url}'${group}`

export const splitGroupKey = (key: string): [string, string] => {
  const i = key.indexOf("'")

  return [key.slice(0, i), key.slice(i + 1)]
}

// A fully-loaded room: its three NIP-29 group-state kinds merged into one value,
// keyed by `${url}'${h}`. Any of `meta`/`members`/`admins` may be absent until
// the relay has served (and signed) the corresponding event.
export type Room = {
  h: string
  id: string
  url: string
  meta?: RoomMetaReader
  members?: RoomMembersReader
  admins?: RoomAdminsReader
}

// Metadata used when publishing NIP-29 room events. `h` is the group id.
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
 * NIP-29 relay-based groups (rooms). A `${url}'${h}`-keyed collection whose
 * values bundle a room's metadata, members, and admins. Also owns room management.
 *
 * The three group-state kinds are authored by the relay itself, so an event is
 * only merged when its author matches the relay's NIP-11 `self` pubkey.
 */
export class Rooms extends LoadableMapPlugin<Room> {
  fetch = async (id: string): Promise<Room> => {
    const [url, h] = splitGroupKey(id)

    const relay = await this.app.use(Relays).load(url)

    const room: Room = this.get(id) ?? {id, url, h}

    await this.app.use(Network).load({
      relays: [url],
      filters: [{kinds: [ROOM_META, ROOM_MEMBERS, ROOM_ADMINS], "#d": [h]}],
      onEvent: event => {
        if (event.pubkey !== relay?.self) return

        if (event.kind === ROOM_META && gt(event.created_at, room.meta?.createdAt())) {
          room.meta = this.app.use(Domain).reader(RoomMetaKind)(event)
          this.set(id, room)
        } else if (event.kind === ROOM_MEMBERS && gt(event.created_at, room.members?.createdAt())) {
          room.members = this.app.use(Domain).reader(RoomMembers)(event)
          this.set(id, room)
        } else if (event.kind === ROOM_ADMINS && gt(event.created_at, room.admins?.createdAt())) {
          room.admins = this.app.use(Domain).reader(RoomAdmins)(event)
          this.set(id, room)
        }
      },
    })

    return room
  }

  forGroup = (url: string, h: string) => this.one(makeGroupKey(url, h))

  forUrl = (url: string): Projection<Room[]> =>
    projectFrom(this.index, byKey =>
      Array.from(byKey.entries())
        .filter(([key]) => key.startsWith(`${url}'`))
        .map(([, room]) => room),
    )

  createRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomCreate).setGroup(url, room.h))

  deleteRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomDelete).setGroup(url, room.h))

  editRoom = (url: string, room: RoomMeta) => {
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

  joinRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomJoin).setGroup(url, room.h))

  leaveRoom = (url: string, room: RoomMeta) =>
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
