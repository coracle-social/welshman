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

export type MakeUserDataOptions<T> = {
  mapStore: Readable<Map<string, T>>
  loadItem: (pubkey: string) => unknown
}

const makeUserData = <T>({mapStore, loadItem}: MakeUserDataOptions<T>) =>
  withGetter(
    derived([mapStore, pubkey], ([$mapStore, $pubkey]) => {
      if (!$pubkey) return undefined

      loadItem($pubkey)

      return $mapStore.get($pubkey)
    })
  )

export const userProfile = makeUserData({
  mapStore: profilesByPubkey,
  loadItem: loadProfile,
})

export const userFollows = makeUserData({
  mapStore: followsByPubkey,
  loadItem: loadFollows,
})

export const userMutes = makeUserData({
  mapStore: mutesByPubkey,
  loadItem: loadMutes,
})

export const userPins = makeUserData({
  mapStore: pinsByPubkey,
  loadItem: loadPins,
})

export const userRelaySelections = makeUserData({
  mapStore: relaySelectionsByPubkey,
  loadItem: loadRelaySelections,
})

export const userInboxRelaySelections = makeUserData({
  mapStore: inboxRelaySelectionsByPubkey,
  loadItem: loadInboxRelaySelections,
})

export const userBlossomServers = makeUserData({
  mapStore: blossomServersByPubkey,
  loadItem: loadBlossomServers,
})

export const getUserWotScore = (tpk: string) => wotGraph.get().get(tpk) || 0

export const deriveUserWotScore = (tpk: string) => derived(wotGraph, $g => $g.get(tpk) || 0)
