import {derived, Readable} from "svelte/store"
import {withGetter} from "@welshman/store"
import {pubkey} from "./session.js"
import {profilesByPubkey, loadProfile} from "./profiles.js"
import {followsByPubkey, loadFollows} from "./follows.js"
import {loadPins, pinsByPubkey} from "./pins.js"
import {mutesByPubkey, loadMutes} from "./mutes.js"
import {blossomServersByPubkey, loadBlossomServers} from "./blossom.js"
import {
  relaySelectionsByPubkey,
  inboxRelaySelectionsByPubkey,
  loadRelaySelections,
  loadInboxRelaySelections,
} from "./relaySelections.js"
import {wotGraph} from "./wot.js"

export type UserDataLoader = (pubkey: string, relays?: string[], force?: boolean) => unknown

export type MakeUserDataOptions<T> = {
  mapStore: Readable<Map<string, T>>
  loadItem: UserDataLoader
}

const makeUserData = <T>({mapStore, loadItem}: MakeUserDataOptions<T>) =>
  withGetter(
    derived([mapStore, pubkey], ([$mapStore, $pubkey]) => {
      if (!$pubkey) return undefined

      loadItem($pubkey)

      return $mapStore.get($pubkey)
    }),
  )

const makeUserLoader =
  (loadItem: UserDataLoader) =>
  async (relays: string[] = [], force = false) => {
    const $pubkey = pubkey.get()

    if ($pubkey) {
      await loadItem($pubkey, relays, force)
    }
  }

export const userProfile = makeUserData({
  mapStore: profilesByPubkey,
  loadItem: loadProfile,
})

export const loadUserProfile = makeUserLoader(loadProfile)

export const userFollows = makeUserData({
  mapStore: followsByPubkey,
  loadItem: loadFollows,
})

export const loadUserFollows = makeUserLoader(loadFollows)

export const userMutes = makeUserData({
  mapStore: mutesByPubkey,
  loadItem: loadMutes,
})

export const loadUserMutes = makeUserLoader(loadMutes)

export const userPins = makeUserData({
  mapStore: pinsByPubkey,
  loadItem: loadPins,
})

export const loadUserPins = makeUserLoader(loadPins)

export const userRelaySelections = makeUserData({
  mapStore: relaySelectionsByPubkey,
  loadItem: loadRelaySelections,
})

export const loadUserRelaySelections = makeUserLoader(loadRelaySelections)

export const userInboxRelaySelections = makeUserData({
  mapStore: inboxRelaySelectionsByPubkey,
  loadItem: loadInboxRelaySelections,
})

export const loadUserInboxRelaySelections = makeUserLoader(loadInboxRelaySelections)

export const userBlossomServers = makeUserData({
  mapStore: blossomServersByPubkey,
  loadItem: loadBlossomServers,
})

export const loadUserBlossomServers = makeUserLoader(loadBlossomServers)

export const getUserWotScore = (tpk: string) => wotGraph.get().get(tpk) || 0

export const deriveUserWotScore = (tpk: string) => derived(wotGraph, $g => $g.get(tpk) || 0)
