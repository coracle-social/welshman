import {uniq, reject, nth, now, nthNe, removeUndefined, nthEq} from "@welshman/lib"
import {
  sendManagementRequest,
  addToListPublicly,
  addToListPrivately,
  updateList,
  removeFromList,
  makeHttpAuth,
  getListTags,
  getRelayTags,
  getRelayTagValues,
  getRelaysFromList,
  makeList,
  makeRoomCreateEvent,
  makeRoomDeleteEvent,
  makeRoomEditEvent,
  makeRoomJoinEvent,
  makeRoomLeaveEvent,
  makeRoomAddMemberEvent,
  makeRoomRemoveMemberEvent,
  isPublishedProfile,
  createProfile,
  editProfile,
  RelayMode,
  makeEvent,
  MESSAGING_RELAYS,
  BLOCKED_RELAYS,
  SEARCH_RELAYS,
  FOLLOWS,
  RELAYS,
  MUTES,
  PINS,
  prep,
} from "@welshman/util"
import type {ManagementRequest, EventTemplate, RoomMeta, Profile} from "@welshman/util"
import {addMaximalFallbacks} from "./router.js"
import type {Router} from "./router.js"
import {MergedThunk, publishThunk} from "./thunk.js"
import type {ThunkOptions} from "./thunk.js"
import type {ClientContext} from "./client.js"
import type {User} from "./user.js"
import type {RelayLists} from "./relayLists.js"
import type {MessagingRelayLists} from "./messagingRelayLists.js"
import type {BlockedRelayLists} from "./blockedRelayLists.js"
import type {SearchRelayLists} from "./searchRelayLists.js"
import type {FollowLists} from "./follows.js"
import type {MuteLists} from "./mutes.js"
import type {PinLists} from "./pins.js"

export type CommandsDeps = {
  client: ClientContext
  user: User
  router: Router
  relayLists: RelayLists
  messagingRelayLists: MessagingRelayLists
  blockedRelayLists: BlockedRelayLists
  searchRelayLists: SearchRelayLists
  followLists: FollowLists
  muteLists: MuteLists
  pinLists: PinLists
}

export type SendWrappedOptions = Omit<
  ThunkOptions,
  "event" | "relays" | "recipient" | "client" | "user"
> & {
  event: EventTemplate
  recipients: string[]
}

/**
 * The high-level "do an action" API: each method builds an event for the
 * client's user and publishes it via a thunk. Replaces the old module of global
 * functions; everything that used a global (current pubkey, signer, router, the
 * user's lists) is now injected.
 */
export class Commands {
  readonly client: ClientContext
  readonly user: User
  readonly router: Router
  readonly relayLists: RelayLists
  readonly messagingRelayLists: MessagingRelayLists
  readonly blockedRelayLists: BlockedRelayLists
  readonly searchRelayLists: SearchRelayLists
  readonly followLists: FollowLists
  readonly muteLists: MuteLists
  readonly pinLists: PinLists

  constructor(deps: CommandsDeps) {
    this.client = deps.client
    this.user = deps.user
    this.router = deps.router
    this.relayLists = deps.relayLists
    this.messagingRelayLists = deps.messagingRelayLists
    this.blockedRelayLists = deps.blockedRelayLists
    this.searchRelayLists = deps.searchRelayLists
    this.followLists = deps.followLists
    this.muteLists = deps.muteLists
    this.pinLists = deps.pinLists
  }

  private publish = (options: Omit<ThunkOptions, "client" | "user">) =>
    publishThunk({...options, client: this.client, user: this.user})

  private fromUser = () => this.router.FromUser().policy(addMaximalFallbacks).getUrls()

  private encryptToSelf = (payload: string) => this.user.nip44EncryptToSelf(payload)

  // NIP 65

  removeRelay = async (url: string, mode: RelayMode) => {
    const list = (await this.relayLists.forceLoad(this.user.pubkey, [])) || makeList({kind: RELAYS})
    const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
    const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read
    const tags = list.publicTags.filter(nthNe(1, url))

    // If we had a duplicate that was used as the alt mode, keep the alt
    if (dup && (!dup[2] || dup[2] === alt)) {
      tags.push(["r", url, alt])
    }

    const event = {kind: list.kind, content: list.event?.content || "", tags}
    const relays = this.fromUser()

    // Make sure to notify the old relay too
    relays.push(url)

    return this.publish({event, relays})
  }

  addRelay = async (url: string, mode: RelayMode) => {
    const list = (await this.relayLists.forceLoad(this.user.pubkey, [])) || makeList({kind: RELAYS})
    const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
    const tag = removeUndefined(["r", url, dup && dup[2] !== mode ? undefined : mode])
    const tags = [...list.publicTags.filter(nthNe(1, url)), tag]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.publish({event, relays: this.fromUser()})
  }

  setRelays = async (tags: string[][]) => {
    const event = makeEvent(RELAYS, {tags})
    const relays = this.router
      .merge([this.router.Index(), this.router.FromRelays(getRelayTagValues(tags))])
      .getUrls()

    return this.publish({event, relays})
  }

  setReadRelays = async (urls: string[]) => {
    const list = (await this.relayLists.forceLoad(this.user.pubkey, [])) || makeList({kind: RELAYS})
    const writeRelays = reject(nthEq(2, RelayMode.Read), getRelayTags(getListTags(list))).map(nth(1))
    const writeTags = writeRelays.map(url => ["r", url, RelayMode.Write])
    const readTags = urls.map(url => ["r", url, RelayMode.Read])
    const tags = [...writeTags, ...readTags]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.publish({event, relays: this.fromUser()})
  }

  setWriteRelays = async (urls: string[]) => {
    const list = (await this.relayLists.forceLoad(this.user.pubkey, [])) || makeList({kind: RELAYS})
    const readRelays = reject(nthEq(2, RelayMode.Write), getRelayTags(getListTags(list))).map(nth(1))
    const readTags = readRelays.map(url => ["r", url, RelayMode.Read])
    const writeTags = urls.map(url => ["r", url, RelayMode.Write])
    const tags = [...readTags, ...writeTags]
    const event = {kind: list.kind, content: list.event?.content || "", tags}

    return this.publish({event, relays: this.fromUser()})
  }

  // NIP 17

  removeMessagingRelay = async (url: string) => {
    const list =
      (await this.messagingRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: MESSAGING_RELAYS})
    const event = await removeFromList(list, url).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  addMessagingRelay = async (url: string) => {
    const list =
      (await this.messagingRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: MESSAGING_RELAYS})
    const event = await addToListPublicly(list, ["relay", url]).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  setMessagingRelays = async (urls: string[]) => {
    const event = makeEvent(MESSAGING_RELAYS, {tags: urls.map(url => ["relay", url])})

    return this.publish({event, relays: this.router.FromUser().getUrls()})
  }

  // Blocked Relays

  removeBlockedRelay = async (url: string) => {
    const list =
      (await this.blockedRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: BLOCKED_RELAYS})
    const event = await removeFromList(list, url).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  addBlockedRelay = async (url: string) => {
    const list =
      (await this.blockedRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: BLOCKED_RELAYS})
    const event = await addToListPublicly(list, ["relay", url]).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  setBlockedRelays = async (urls: string[]) => {
    const event = makeEvent(BLOCKED_RELAYS, {tags: urls.map(url => ["relay", url])})

    return this.publish({event, relays: this.router.FromUser().getUrls()})
  }

  // Search Relays

  removeSearchRelay = async (url: string) => {
    const list =
      (await this.searchRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: SEARCH_RELAYS})
    const event = await removeFromList(list, url).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  addSearchRelay = async (url: string) => {
    const list =
      (await this.searchRelayLists.forceLoad(this.user.pubkey, [])) ||
      makeList({kind: SEARCH_RELAYS})
    const event = await addToListPublicly(list, ["relay", url]).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  setSearchRelays = async (urls: string[]) => {
    const event = makeEvent(SEARCH_RELAYS, {tags: urls.map(url => ["relay", url])})

    return this.publish({event, relays: this.router.FromUser().getUrls()})
  }

  // NIP 01

  setProfile = (profile: Profile) => {
    const relays = this.router.merge([this.router.Index(), this.router.FromUser()]).getUrls()
    const event = isPublishedProfile(profile) ? editProfile(profile) : createProfile(profile)

    return this.publish({event, relays})
  }

  // NIP 02

  unfollow = async (value: string) => {
    const list = (await this.followLists.forceLoad(this.user.pubkey, [])) || makeList({kind: FOLLOWS})
    const event = await removeFromList(list, value).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  follow = async (tag: string[]) => {
    const list = (await this.followLists.forceLoad(this.user.pubkey, [])) || makeList({kind: FOLLOWS})
    const event = await addToListPublicly(list, tag).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  unmute = async (value: string) => {
    const list = (await this.muteLists.forceLoad(this.user.pubkey, [])) || makeList({kind: MUTES})
    const event = await removeFromList(list, value).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  mutePublicly = async (tag: string[]) => {
    const list = (await this.muteLists.forceLoad(this.user.pubkey, [])) || makeList({kind: MUTES})
    const event = await addToListPublicly(list, tag).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  mutePrivately = async (tag: string[]) => {
    const list = (await this.muteLists.forceLoad(this.user.pubkey, [])) || makeList({kind: MUTES})
    const event = await addToListPrivately(list, tag).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  setMutes = async ({
    publicTags,
    privateTags,
  }: {
    publicTags?: string[][]
    privateTags?: string[][]
  }) => {
    const list = (await this.muteLists.forceLoad(this.user.pubkey, [])) || makeList({kind: MUTES})
    const event = await updateList(list, {publicTags, privateTags}).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  unpin = async (value: string) => {
    const list = (await this.pinLists.forceLoad(this.user.pubkey, [])) || makeList({kind: PINS})
    const event = await removeFromList(list, value).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  pin = async (tag: string[]) => {
    const list = (await this.pinLists.forceLoad(this.user.pubkey, [])) || makeList({kind: PINS})
    const event = await addToListPublicly(list, tag).reconcile(this.encryptToSelf)

    return this.publish({event, relays: this.fromUser()})
  }

  // NIP 59

  sendWrapped = async ({event, recipients, ...options}: SendWrappedOptions) => {
    // Stabilize the event id across the different wraps
    const stableEvent = prep(event, this.user.pubkey, now())

    return new MergedThunk(
      await Promise.all(
        uniq(recipients).map(async recipient => {
          const relays = getRelaysFromList(await this.messagingRelayLists.load(recipient))

          return this.publish({event: stableEvent, relays, recipient, ...options})
        }),
      ),
    )
  }

  // NIP 86

  manageRelay = async (url: string, request: ManagementRequest) => {
    url = url.replace(/^ws/, "http")

    const authTemplate = await makeHttpAuth(url, "POST", JSON.stringify(request))
    const authEvent = await this.user.sign(authTemplate)

    return sendManagementRequest(url, request, authEvent)
  }

  // NIP 29

  createRoom = (url: string, room: RoomMeta) =>
    this.publish({event: makeRoomCreateEvent(room), relays: [url]})

  deleteRoom = (url: string, room: RoomMeta) =>
    this.publish({event: makeRoomDeleteEvent(room), relays: [url]})

  editRoom = (url: string, room: RoomMeta) =>
    this.publish({event: makeRoomEditEvent(room), relays: [url]})

  joinRoom = (url: string, room: RoomMeta) =>
    this.publish({event: makeRoomJoinEvent(room), relays: [url]})

  leaveRoom = (url: string, room: RoomMeta) =>
    this.publish({event: makeRoomLeaveEvent(room), relays: [url]})

  addRoomMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.publish({event: makeRoomAddMemberEvent(room, pubkey), relays: [url]})

  removeRoomMember = (url: string, room: RoomMeta, pubkey: string) =>
    this.publish({event: makeRoomRemoveMemberEvent(room, pubkey), relays: [url]})
}
