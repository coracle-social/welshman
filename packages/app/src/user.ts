import {derived, Readable} from "svelte/store"
import {withGetter, memoized} from "@welshman/store"
import {pubkey} from "./session.js"
import {profiles} from "./profiles.js"
import {follows} from "./follows.js"
import {mutes} from "./mutes.js"
import {pins} from "./pins.js"
import {blossomServers} from "./blossom.js"
import {relaySelections} from "./relaySelections.js"
import {inboxRelaySelections} from "./inboxRelaySelections.js"

export type UserDataLoader = (pubkey: string, relays?: string[], force?: boolean) => unknown

export type MakeUserDataOptions<T> = {
  mapStore: Readable<Map<string, T>>
  loadItem: UserDataLoader
}

export const makeUserData = <T>({mapStore, loadItem}: MakeUserDataOptions<T>) =>
  withGetter(
    memoized(
      derived([mapStore, pubkey], ([$mapStore, $pubkey]) => {
        if (!$pubkey) return undefined

        loadItem($pubkey)

        return $mapStore.get($pubkey)
      }),
    ),
  )

export const makeUserLoader =
  (loadItem: UserDataLoader) =>
  async (relays: string[] = [], force = false) => {
    const $pubkey = pubkey.get()

    if ($pubkey) {
      await loadItem($pubkey, relays, force)
    }
  }

export const userProfile = makeUserData({
  mapStore: profiles.map$,
  loadItem: profiles.load,
})

export const loadUserProfile = makeUserLoader(profiles.load)

export const userFollows = makeUserData({
  mapStore: follows.map$,
  loadItem: follows.load,
})

export const loadUserFollows = makeUserLoader(follows.load)

export const userMutes = makeUserData({
  mapStore: mutes.map$,
  loadItem: mutes.load,
})

export const loadUserMutes = makeUserLoader(mutes.load)

export const userPins = makeUserData({
  mapStore: pins.map$,
  loadItem: pins.load,
})

export const loadUserPins = makeUserLoader(pins.load)

export const userRelaySelections = makeUserData({
  mapStore: relaySelections.map$,
  loadItem: relaySelections.load,
})

export const loadUserRelaySelections = makeUserLoader(relaySelections.load)

export const userInboxRelaySelections = makeUserData({
  mapStore: inboxRelaySelections.map$,
  loadItem: inboxRelaySelections.load,
})

export const loadUserInboxRelaySelections = makeUserLoader(inboxRelaySelections.load)

export const userBlossomServers = makeUserData({
  mapStore: blossomServers.map$,
  loadItem: blossomServers.load,
})

export const loadUserBlossomServers = makeUserLoader(blossomServers.load)
