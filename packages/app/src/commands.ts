import {get} from "svelte/store"
import {uniq, nthNe, removeNil, nthEq} from "@welshman/lib"
import {
  sendManagementRequest,
  ManagementRequest,
  addToListPublicly,
  EventTemplate,
  removeFromList,
  makeHttpAuth,
  getListTags,
  getRelayTags,
  makeList,
  makeRoomCreateEvent,
  makeRoomDeleteEvent,
  makeRoomEditEvent,
  makeRoomJoinEvent,
  makeRoomLeaveEvent,
  isPublishedProfile,
  createProfile,
  editProfile,
  RelayMode,
  INBOX_RELAYS,
  FOLLOWS,
  RELAYS,
  MUTES,
  PINS,
} from "@welshman/util"
import type {RoomMeta, Profile} from "@welshman/util"
import {Nip59, stamp} from "@welshman/signer"
import {Router, addMaximalFallbacks} from "@welshman/router"
import {
  userRelaySelections,
  userInboxRelaySelections,
  userFollows,
  userMutes,
  userPins,
} from "./user.js"
import {nip44EncryptToSelf, signer} from "./session.js"
import {ThunkOptions, MergedThunk, publishThunk} from "./thunk.js"

// NIP 65

export const removeRelay = async (url: string, mode: RelayMode) => {
  const list = get(userRelaySelections) || makeList({kind: RELAYS})
  const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
  const alt = mode === RelayMode.Read ? RelayMode.Write : RelayMode.Read
  const tags = list.publicTags.filter(nthNe(1, url))

  // If we had a duplicate that was used as the alt mode, keep the alt
  if (dup && (!dup[2] || dup[2] === alt)) {
    tags.push(["r", url, alt])
  }

  const event = {kind: list.kind, content: list.event?.content || "", tags}
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  // Make sure to notify the old relay too
  relays.push(url)

  return publishThunk({event, relays})
}

export const addRelay = async (url: string, mode: RelayMode) => {
  const list = get(userRelaySelections) || makeList({kind: RELAYS})
  const dup = getRelayTags(getListTags(list)).find(nthEq(1, url))
  const tag = removeNil(["r", url, dup && dup[2] !== mode ? undefined : mode])
  const tags = [...list.publicTags.filter(nthNe(1, url)), tag]
  const event = {kind: list.kind, content: list.event?.content || "", tags}
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

// NIP 17

export const removeInboxRelay = async (url: string) => {
  const list = get(userInboxRelaySelections) || makeList({kind: INBOX_RELAYS})
  const event = await removeFromList(list, url).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const addInboxRelay = async (url: string) => {
  const list = get(userInboxRelaySelections) || makeList({kind: INBOX_RELAYS})
  const event = await addToListPublicly(list, ["relay", url]).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

// NIP 01

export const setProfile = (profile: Profile) => {
  const router = Router.get()
  const relays = router.merge([router.Index(), router.FromUser()]).getUrls()
  const event = isPublishedProfile(profile) ? editProfile(profile) : createProfile(profile)

  return publishThunk({event, relays})
}

// NIP 02

export const unfollow = async (value: string) => {
  const list = get(userFollows) || makeList({kind: FOLLOWS})
  const event = await removeFromList(list, value).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const follow = async (tag: string[]) => {
  const list = get(userFollows) || makeList({kind: FOLLOWS})
  const event = await addToListPublicly(list, tag).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const unmute = async (value: string) => {
  const list = get(userMutes) || makeList({kind: MUTES})
  const event = await removeFromList(list, value).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const mute = async (tag: string[]) => {
  const list = get(userMutes) || makeList({kind: MUTES})
  const event = await addToListPublicly(list, tag).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const unpin = async (value: string) => {
  const list = get(userPins) || makeList({kind: PINS})
  const event = await removeFromList(list, value).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

export const pin = async (tag: string[]) => {
  const list = get(userPins) || makeList({kind: PINS})
  const event = await addToListPublicly(list, tag).reconcile(nip44EncryptToSelf)
  const relays = Router.get().FromUser().policy(addMaximalFallbacks).getUrls()

  return publishThunk({event, relays})
}

// NIP 59

export type SendWrappedOptions = Omit<ThunkOptions, "event" | "relays"> & {
  template: EventTemplate
  pubkeys: string[]
}

export const sendWrapped = async ({template, pubkeys, ...options}: SendWrappedOptions) => {
  const nip59 = Nip59.fromSigner(signer.get()!)

  return new MergedThunk(
    await Promise.all(
      uniq(pubkeys).map(async recipient =>
        publishThunk({
          event: await nip59.wrap(recipient, stamp(template)),
          relays: Router.get().PubkeyInbox(recipient).getUrls(),
          ...options,
        }),
      ),
    ),
  )
}

// NIP 86

export const manageRelay = async (url: string, request: ManagementRequest) => {
  url = url.replace(/^ws/, "http")

  const authTemplate = await makeHttpAuth(url, "POST", JSON.stringify(request))
  const authEvent = await signer.get()!.sign(authTemplate)

  return sendManagementRequest(url, request, authEvent)
}

// NIP 29

export const createRoom = (url: string, room: RoomMeta) =>
  publishThunk({event: makeRoomCreateEvent(room), relays: [url]})

export const deleteRoom = (url: string, room: RoomMeta) =>
  publishThunk({event: makeRoomDeleteEvent(room), relays: [url]})

export const editRoom = (url: string, room: RoomMeta) =>
  publishThunk({event: makeRoomEditEvent(room), relays: [url]})

export const joinRoom = (url: string, room: RoomMeta) =>
  publishThunk({event: makeRoomJoinEvent(room), relays: [url]})

export const leaveRoom = (url: string, room: RoomMeta) =>
  publishThunk({event: makeRoomLeaveEvent(room), relays: [url]})
