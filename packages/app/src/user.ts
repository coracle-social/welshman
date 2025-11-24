import {derived, Readable} from "svelte/store"
import {withGetter, memoized} from "@welshman/store"
import {pubkey} from "./session.js"
import {profilesByPubkey, forceLoadProfile, loadProfile} from "./profiles.js"
import {followListsByPubkey, forceLoadFollowList, loadFollowList} from "./follows.js"
import {pinListsByPubkey, forceLoadPinList, loadPinList} from "./pins.js"
import {muteListsByPubkey, forceLoadMuteList, loadMuteList} from "./mutes.js"
import {
  blossomServerListsByPubkey,
  forceLoadBlossomServerList,
  loadBlossomServerList,
} from "./blossom.js"
import {relayListsByPubkey, forceLoadRelayList, loadRelayList} from "./relayLists.js"
import {
  messagingRelayListsByPubkey,
  forceLoadMessagingRelayList,
  loadMessagingRelayList,
} from "./messagingRelayLists.js"
import {wotGraph} from "./wot.js"

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
  mapStore: profilesByPubkey,
  loadItem: loadProfile,
})

export const forceLoadUserProfile = makeUserLoader(forceLoadProfile)
export const loadUserProfile = makeUserLoader(loadProfile)

export const userFollowList = makeUserData({
  mapStore: followListsByPubkey,
  loadItem: loadFollowList,
})

export const forceLoadUserFollowList = makeUserLoader(forceLoadFollowList)
export const loadUserFollowList = makeUserLoader(loadFollowList)

export const userMuteList = makeUserData({
  mapStore: muteListsByPubkey,
  loadItem: loadMuteList,
})

export const forceLoadUserMuteList = makeUserLoader(forceLoadMuteList)
export const loadUserMuteList = makeUserLoader(loadMuteList)

export const userPinList = makeUserData({
  mapStore: pinListsByPubkey,
  loadItem: loadPinList,
})

export const forceLoadUserPinList = makeUserLoader(forceLoadPinList)
export const loadUserPinList = makeUserLoader(loadPinList)

export const userRelayList = makeUserData({
  mapStore: relayListsByPubkey,
  loadItem: loadRelayList,
})

export const forceLoadUserRelayList = makeUserLoader(forceLoadRelayList)
export const loadUserRelayList = makeUserLoader(loadRelayList)

export const userMessagingRelayList = makeUserData({
  mapStore: messagingRelayListsByPubkey,
  loadItem: loadMessagingRelayList,
})

export const forceLoadUserMessagingRelayList = makeUserLoader(forceLoadMessagingRelayList)
export const loadUserMessagingRelayList = makeUserLoader(loadMessagingRelayList)

export const userBlossomServerList = makeUserData({
  mapStore: blossomServerListsByPubkey,
  loadItem: loadBlossomServerList,
})

export const forceLoadUserBlossomServerList = makeUserLoader(forceLoadBlossomServerList)
export const loadUserBlossomServerList = makeUserLoader(loadBlossomServerList)

export const getUserWotScore = (tpk: string) => wotGraph.get().get(tpk) || 0

export const deriveUserWotScore = (tpk: string) => derived(wotGraph, $g => $g.get(tpk) || 0)
