import {derived, Readable} from "svelte/store"
import {ItemsByKey} from "@welshman/store"
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
import {
  blockedRelayListsByPubkey,
  forceLoadBlockedRelayList,
  loadBlockedRelayList,
} from "./blockedRelayLists.js"
import {wotGraph, getWotGraph} from "./wot.js"

export const makeUserData = <T>(
  itemsByKey: Readable<ItemsByKey<T>>,
  onDerive?: (key: string, ...args: any[]) => void,
) =>
  derived([itemsByKey, pubkey], ([$itemsByKey, $pubkey]) => {
    if (!$pubkey) return undefined

    onDerive?.($pubkey)

    return $itemsByKey.get($pubkey)
  })

export const makeUserLoader =
  (loadItem: (key: string, ...args: any[]) => void) =>
  async (...args: any[]) => {
    const $pubkey = pubkey.get()

    if ($pubkey) {
      await loadItem($pubkey, ...args)
    }
  }

export const userProfile = makeUserData(profilesByPubkey, loadProfile)
export const forceLoadUserProfile = makeUserLoader(forceLoadProfile)
export const loadUserProfile = makeUserLoader(loadProfile)

export const userFollowList = makeUserData(followListsByPubkey, loadFollowList)
export const forceLoadUserFollowList = makeUserLoader(forceLoadFollowList)
export const loadUserFollowList = makeUserLoader(loadFollowList)

export const userMuteList = makeUserData(muteListsByPubkey, loadMuteList)
export const forceLoadUserMuteList = makeUserLoader(forceLoadMuteList)
export const loadUserMuteList = makeUserLoader(loadMuteList)

export const userPinList = makeUserData(pinListsByPubkey, loadPinList)
export const forceLoadUserPinList = makeUserLoader(forceLoadPinList)
export const loadUserPinList = makeUserLoader(loadPinList)

export const userRelayList = makeUserData(relayListsByPubkey, loadRelayList)
export const forceLoadUserRelayList = makeUserLoader(forceLoadRelayList)
export const loadUserRelayList = makeUserLoader(loadRelayList)

export const userMessagingRelayList = makeUserData(
  messagingRelayListsByPubkey,
  loadMessagingRelayList,
)
export const forceLoadUserMessagingRelayList = makeUserLoader(forceLoadMessagingRelayList)
export const loadUserMessagingRelayList = makeUserLoader(loadMessagingRelayList)

export const userBlockedRelayList = makeUserData(blockedRelayListsByPubkey, loadBlockedRelayList)
export const forceLoadUserBlockedRelayList = makeUserLoader(forceLoadBlockedRelayList)
export const loadUserBlockedRelayList = makeUserLoader(loadBlockedRelayList)

export const userBlossomServerList = makeUserData(blossomServerListsByPubkey, loadBlossomServerList)
export const forceLoadUserBlossomServerList = makeUserLoader(forceLoadBlossomServerList)
export const loadUserBlossomServerList = makeUserLoader(loadBlossomServerList)

export const getUserWotScore = (tpk: string) => getWotGraph().get(tpk) || 0

export const deriveUserWotScore = (tpk: string) => derived(wotGraph, $g => $g.get(tpk) || 0)
