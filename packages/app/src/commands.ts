import {get} from "svelte/store"
import {uniq, nthNe, removeNil, nthEq} from "@welshman/lib"
import {
  addToListPublicly,
  EventTemplate,
  removeFromList,
  getListTags,
  getRelayTags,
  makeList,
  RelayMode,
  INBOX_RELAYS,
  FOLLOWS,
  RELAYS,
  MUTES,
  PINS,
} from "@welshman/util"
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
