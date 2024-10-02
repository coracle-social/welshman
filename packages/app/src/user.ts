import {derived} from 'svelte/store'
import {pubkey} from './session'
import {profilesByPubkey, loadProfile} from './profiles'
import {followsByPubkey, loadFollows} from './follows'
import {mutesByPubkey, loadMutes} from './mutes'
import {relaySelectionsByPubkey, inboxRelaySelectionsByPubkey, loadRelaySelections, loadInboxRelaySelections} from './relaySelections'
import {wotGraph} from './wot'

export const userProfile = derived(
  [profilesByPubkey, pubkey],
  ([$profilesByPubkey, $pubkey]) => {
    if (!$pubkey) return undefined

    loadProfile($pubkey)

    return $profilesByPubkey.get($pubkey)
  }
)

export const userFollows = derived(
  [followsByPubkey, pubkey],
  ([$followsByPubkey, $pubkey]) => {
    if (!$pubkey) return undefined

    loadFollows($pubkey)

    return $followsByPubkey.get($pubkey)
  }
)

export const userMutes = derived(
  [mutesByPubkey, pubkey],
  ([$mutesByPubkey, $pubkey]) => {
    if (!$pubkey) return undefined

    loadMutes($pubkey)

    return $mutesByPubkey.get($pubkey)
  }
)

export const userRelaySelections = derived(
  [relaySelectionsByPubkey, pubkey],
  ([$relaySelectionsByPubkey, $pubkey]) => {
    if (!$pubkey) return undefined

    loadRelaySelections($pubkey)

    return $relaySelectionsByPubkey.get($pubkey)
  }
)

export const userInboxRelaySelections = derived(
  [inboxRelaySelectionsByPubkey, pubkey],
  ([$inboxRelaySelectionsByPubkey, $pubkey]) => {
    if (!$pubkey) return undefined

    loadInboxRelaySelections($pubkey)

    return $inboxRelaySelectionsByPubkey.get($pubkey)
  }
)

export const getUserWotScore = (tpk: string) => wotGraph.get().get(tpk) || 0

export const deriveUserWotScore = (tpk: string) => derived(wotGraph, $g => $g.get(tpk) || 0)
