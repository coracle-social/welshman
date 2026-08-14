import {derived} from "svelte/store"
import type {Readable} from "svelte/store"
import {gte, max, pushToMapKey} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {
  ROOM_META,
  ROOM_MEMBERS,
  ROOM_ADMINS,
  ROOM_DELETE,
  ROOM_ADD_MEMBER,
  ROOM_REMOVE_MEMBER,
  ROOM_JOIN,
  ROOM_LEAVE,
  hexTags,
  sortEventsAsc,
  sortEventsDesc,
  tagSpec,
  tagValues,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {
  deriveEventsByIdByUrl,
  deriveItems,
  deriveItemsByKeyByUrl,
  makeDeriveItem,
  makeForceLoadItem,
  makeLoadItem,
} from "@welshman/store"
import type {EventToItem, ItemsByKey} from "@welshman/store"
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
import type {EventReader} from "@welshman/domain"
import {projection, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Domain} from "./domain.js"
import {Network} from "./network.js"
import {Relays} from "./relays.js"
import type {IApp} from "../app.js"

// NIP-29 room metadata (kinds 39000–39002) is addressable per room but hosted
// on a specific relay, so the same room id can exist independently on many
// relays. Key it by `${url}'${room}` (the `'` separator matches flotilla's
// room-id convention; relay urls never contain it).
export const makeRoomKey = (url: string, room: string) => `${url}'${room}`

export const splitRoomKey = (key: string): [string, string] => {
  const i = key.indexOf("'")

  return [key.slice(0, i), key.slice(i + 1)]
}

// A fully-loaded room: its three NIP-29 room-state kinds merged into one value,
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

// Metadata used when publishing NIP-29 room events. `h` is the room id.
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

// One room-state kind, keyed per relay. The three kinds are authored by the
// relay itself, so an event only counts when its author matches the relay's
// NIP-11 `self` pubkey — that rejects room state forged by other pubkeys.
// Self pubkeys load from NIP-11 and can arrive after the events, so this
// re-evaluates whenever the relay-profile collection changes.
const deriveRoomState = <R extends EventReader>(
  app: IApp,
  kind: number,
  eventToItem: EventToItem<R>,
) =>
  deriveItemsByKeyByUrl<R>({
    filters: [{kinds: [kind]}],
    eventToItem,
    getKey: (item, url) =>
      item.author() === app.use(Relays).get(url)?.self
        ? makeRoomKey(url, item.identifier() ?? "")
        : undefined,
    revalidateOn: app.use(Relays).index.$,
    tracker: app.tracker,
    repository: app.repository,
  })

export enum MembershipStatus {
  Initial = "initial",
  Pending = "pending",
  Granted = "granted",
}

// A room's membership as the relay currently has it, plus the join/leave requests
// it hasn't answered yet. `admins` is carried along so a status read needs only
// this record.
export type RoomMembership = {
  members: Set<string>
  admins: Set<string>
  requests: Map<string, TrustedEvent>
}

/**
 * Replay one room's membership.
 *
 * The 39002 snapshot is authoritative as of its own `created_at`: it resets the
 * set, and any op older than it has already been folded in by the relay. Newer
 * 9000/9001 ops apply on top, which is what makes an add visible before the relay
 * has regenerated the snapshot.
 *
 * Ops are moderation actions, so only an admin or the relay itself can author one
 * — and the pubkey they act on comes from the `p` tag, never from the author.
 *
 * Join/leave requests are self-authored and carry no authority; they only mean
 * something while the membership state hasn't already answered them.
 */
const foldMembership = (
  room: Maybe<Room>,
  self: Maybe<string>,
  events: TrustedEvent[],
): RoomMembership => {
  const snapshotAt = room?.members?.createdAt() ?? 0
  const members = new Set(room?.members?.members() ?? [])
  const admins = new Set(room?.admins?.pubkeys() ?? [])
  // When each pubkey's membership was last set, so a request that predates the
  // answer to it doesn't resurface as pending.
  const touchedAt = new Map<string, number>()
  const requests = new Map<string, TrustedEvent>()

  for (const event of sortEventsAsc(events)) {
    if (event.kind === ROOM_JOIN || event.kind === ROOM_LEAVE) {
      requests.set(event.pubkey, event)
      continue
    }

    if (event.created_at <= snapshotAt) continue
    if (!admins.has(event.pubkey) && event.pubkey !== self) continue

    for (const pubkey of tagValues(hexTags("p"), event.tags)) {
      if (event.kind === ROOM_ADD_MEMBER) {
        members.add(pubkey)
      } else {
        members.delete(pubkey)
      }

      touchedAt.set(pubkey, event.created_at)
    }
  }

  for (const [pubkey, event] of requests) {
    if (event.created_at <= max([snapshotAt, touchedAt.get(pubkey)])) {
      requests.delete(pubkey)
    }
  }

  return {members, admins, requests}
}

const getMembershipStatus = (membership: Maybe<RoomMembership>, pubkey: Maybe<string>) => {
  if (!membership || !pubkey) return MembershipStatus.Initial
  if (membership.admins.has(pubkey)) return MembershipStatus.Granted

  const isMember = membership.members.has(pubkey)
  const request = membership.requests.get(pubkey)

  if (request?.kind === ROOM_LEAVE) return MembershipStatus.Initial
  if (request?.kind === ROOM_JOIN && !isMember) return MembershipStatus.Pending

  return isMember ? MembershipStatus.Granted : MembershipStatus.Initial
}

/**
 * NIP-29 relay-based rooms. A `${url}'${h}`-keyed collection whose values bundle
 * a room's metadata, members, and admins, derived from the repository so a space
 * can be enumerated without loading each room by id. Also owns room management.
 *
 * Rooms a kind-9008 delete supersedes are dropped, so a tombstoned room stops
 * appearing without the caller having to filter.
 */
export class Rooms {
  index: Projection<ItemsByKey<Room>>
  all: Projection<Room[]>
  byUrl: Projection<Map<string, Room[]>>
  membership: Projection<ItemsByKey<RoomMembership>>
  one: (key?: string, ...args: any[]) => Readable<Maybe<Room>>
  load: (key: string, ...args: any[]) => Promise<Maybe<Room>>
  forceLoad: (key: string, ...args: any[]) => Promise<Maybe<Room>>

  constructor(protected readonly app: IApp) {
    // Deletes are moderation ops rather than relay-signed room state, so they
    // aren't self-checked, and one event can tombstone several rooms at once.
    // Keep the newest per room, since a room can be re-created after a delete.
    const deletedAt = derived(
      deriveEventsByIdByUrl({
        filters: [{kinds: [ROOM_DELETE]}],
        tracker: app.tracker,
        repository: app.repository,
      }),
      $eventsByIdByUrl => {
        const result = new Map<string, number>()

        for (const [url, eventsById] of $eventsByIdByUrl) {
          for (const event of eventsById.values()) {
            for (const h of tagValues(tagSpec("h"), event.tags)) {
              const key = makeRoomKey(url, h)

              result.set(key, max([result.get(key), event.created_at]))
            }
          }
        }

        return result
      },
    )

    const index = derived(
      [
        deriveRoomState(app, ROOM_META, app.use(Domain).reader(RoomMetaKind)),
        deriveRoomState(app, ROOM_MEMBERS, app.use(Domain).reader(RoomMembers)),
        deriveRoomState(app, ROOM_ADMINS, app.use(Domain).reader(RoomAdmins)),
        deletedAt,
      ],
      ([$metas, $members, $admins, $deletedAt]) => {
        const result = new Map<string, Room>()

        for (const id of new Set([...$metas.keys(), ...$members.keys(), ...$admins.keys()])) {
          const meta = $metas.get(id)
          const members = $members.get(id)
          const admins = $admins.get(id)
          const createdAt = max([meta?.createdAt(), members?.createdAt(), admins?.createdAt()])

          if (gte($deletedAt.get(id), createdAt)) continue

          const [url, h] = splitRoomKey(id)

          result.set(id, {id, url, h, meta, members, admins})
        }

        return result
      },
    )

    this.index = projection(index)
    this.all = projection(deriveItems(index))
    this.byUrl = projectFrom(this.index, byKey => {
      const result = new Map<string, Room[]>()

      for (const room of byKey.values()) {
        pushToMapKey(result, room.url, room)
      }

      return result
    })

    this.membership = projection(
      derived(
        [
          index,
          app.use(Relays).index.$,
          deriveEventsByIdByUrl({
            filters: [{kinds: [ROOM_ADD_MEMBER, ROOM_REMOVE_MEMBER, ROOM_JOIN, ROOM_LEAVE]}],
            tracker: app.tracker,
            repository: app.repository,
          }),
        ],
        ([$index, $relays, $eventsByIdByUrl]) => {
          const eventsByKey = new Map<string, TrustedEvent[]>()

          for (const [url, eventsById] of $eventsByIdByUrl) {
            for (const event of eventsById.values()) {
              for (const h of tagValues(tagSpec("h"), event.tags)) {
                pushToMapKey(eventsByKey, makeRoomKey(url, h), event)
              }
            }
          }

          const result = new Map<string, RoomMembership>()

          // A room can have a snapshot with no ops, or ops before any snapshot.
          for (const id of new Set([...$index.keys(), ...eventsByKey.keys()])) {
            const [url] = splitRoomKey(id)

            result.set(
              id,
              foldMembership($index.get(id), $relays.get(url)?.self, eventsByKey.get(id) ?? []),
            )
          }

          return result
        },
      ),
    )

    const fetch = (key: string) => this.fetch(key)
    const read = (key: string) => this.index.get().get(key)

    this.load = makeLoadItem(fetch, read)
    this.forceLoad = makeForceLoadItem(fetch, read)
    this.one = makeDeriveItem(index, this.load)
  }

  // The relay's `self` pubkey gates every room-state event, so load the relay
  // profile before the events that depend on it.
  fetch = async (id: string) => {
    const [url, h] = splitRoomKey(id)

    await this.app.use(Relays).load(url)

    return this.app.use(Network).load({
      relays: [url],
      filters: [
        {kinds: [ROOM_META, ROOM_MEMBERS, ROOM_ADMINS], "#d": [h]},
        {kinds: [ROOM_DELETE], "#h": [h]},
      ],
    })
  }

  get = (key: string) => this.index.get().get(key)

  project = <U>(key: string, read: (item: Maybe<Room>) => U): Projection<U> =>
    projection(derived(this.one(key), read), () => read(this.get(key)))

  forRoom = (url: string, h: string) => this.one(makeRoomKey(url, h))

  forUrl = (url: string): Projection<Room[]> =>
    projectFrom(this.byUrl, byUrl => byUrl.get(url) ?? [])

  members = (url: string, h: string): Projection<Set<string>> =>
    projectFrom(this.membership, byKey => byKey.get(makeRoomKey(url, h))?.members ?? new Set())

  membershipStatus = (
    url: string,
    h: string,
    pubkey = this.app.user?.pubkey,
  ): Projection<MembershipStatus> =>
    projectFrom(this.membership, byKey =>
      getMembershipStatus(byKey.get(makeRoomKey(url, h)), pubkey),
    )

  // Join requests still awaiting an admin, for a single room or a whole space.
  pendingJoins = (url: string, h?: string): Projection<TrustedEvent[]> =>
    projectFrom(this.membership, byKey => {
      const result: TrustedEvent[] = []

      for (const [id, {members, requests}] of byKey) {
        const [roomUrl, roomH] = splitRoomKey(id)

        if (roomUrl !== url) continue
        if (h && roomH !== h) continue

        for (const [pubkey, event] of requests) {
          if (event.kind === ROOM_JOIN && !members.has(pubkey)) {
            result.push(event)
          }
        }
      }

      return sortEventsDesc(result)
    })

  createRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomCreate).setRoom(url, room.h))

  deleteRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomDelete).setRoom(url, room.h))

  editRoom = (url: string, room: RoomMeta) => {
    const writer = this.app.use(Domain).writer(RoomEdit).setRoom(url, room.h)

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
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomJoin).setRoom(url, room.h))

  leaveRoom = (url: string, room: RoomMeta) =>
    this.app.use(Domain).command(this.app.use(Domain).writer(RoomLeave).setRoom(url, room.h))

  addMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Domain)
      .command(this.app.use(Domain).writer(RoomAddMember).setRoom(url, room.h).addPubkey(pubkey))

  removeMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.app
      .use(Domain)
      .command(this.app.use(Domain).writer(RoomRemoveMember).setRoom(url, room.h).addPubkey(pubkey))
}
