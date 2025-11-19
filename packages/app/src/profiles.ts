import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {deriveItemsByKey, deriveItems, makeForceLoadItem, makeLoadItem, makeDeriveItem, getter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoaderWithIndexers} from "./relaySelections.js"

export const profilesByPubkey = deriveItemsByKey({
  repository,
  eventToItem: readProfile,
  filters: [{kinds: [PROFILE]}],
  getKey: profile => profile.event.pubkey,
})

export const profiles = deriveItems(profilesByPubkey)

export const getProfilesByPubkey = getter(profilesByPubkey)

export const getProfile = (pubkey: string) => getProfilesByPubkey().get(pubkey)

export const forceLoadProfile = makeForceLoadItem(makeOutboxLoaderWithIndexers(PROFILE), getProfile)

export const loadProfile = makeLoadItem(makeOutboxLoaderWithIndexers(PROFILE), getProfile)

export const deriveProfile = makeDeriveItem(profilesByPubkey, loadProfile)

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey ? displayProfile(getProfile(pubkey), displayPubkey(pubkey)) : ""

export const deriveProfileDisplay = (pubkey: string | undefined, ...args: any[]) =>
  pubkey
    ? derived(deriveProfile(pubkey, ...args), $profile =>
        displayProfile($profile, displayPubkey(pubkey)),
      )
    : readable("")
