import {get} from 'svelte/store'
import {ctx} from '@welshman/lib'
import {addToListPublicly, removeFromList, makeList, FOLLOWS, MUTES} from '@welshman/util'
import {userFollows, userMutes} from './user'
import {nip44EncryptToSelf} from './session'
import {publishThunk} from './thunk'

export const unfollow = async (value: string) => {
  const list = get(userFollows) || makeList({kind: FOLLOWS})
  const event = await removeFromList(list, value).reconcile(nip44EncryptToSelf)

  return publishThunk({event, relays: ctx.app.router.WriteRelays().getUrls()})
}

export const follow = async (tag: string[]) => {
  const list = get(userFollows) || makeList({kind: FOLLOWS})
  const event = await addToListPublicly(list, tag).reconcile(nip44EncryptToSelf)

  return publishThunk({event, relays: ctx.app.router.WriteRelays().getUrls()})
}

export const unmute = async (value: string) => {
  const list = get(userMutes) || makeList({kind: MUTES})
  const event = await removeFromList(list, value).reconcile(nip44EncryptToSelf)

  return publishThunk({event, relays: ctx.app.router.WriteRelays().getUrls()})
}

export const mute = async (tag: string[]) => {
  const list = get(userMutes) || makeList({kind: MUTES})
  const event = await addToListPublicly(list, tag).reconcile(nip44EncryptToSelf)

  return publishThunk({event, relays: ctx.app.router.WriteRelays().getUrls()})
}
