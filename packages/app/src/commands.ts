import {get} from "svelte/store"
import {uniq} from "@welshman/lib"
import {
  addToListPublicly,
  EventTemplate,
  removeFromList,
  makeList,
  FOLLOWS,
  MUTES,
  PINS,
} from "@welshman/util"
import {Nip59, stamp} from "@welshman/signer"
import {Router, addMaximalFallbacks} from "@welshman/router"
import {userFollows, userMutes, userPins} from "./user.js"
import {nip44EncryptToSelf, signer} from "./session.js"
import {ThunkOptions, MergedThunk, publishThunk} from "./thunk.js"

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
