import {derived, readable} from 'svelte/store'
import {readProfile, displayProfile, displayPubkey, PROFILE} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {type PublishedProfile} from "@welshman/util"
import {deriveEventsMapped, withGetter} from '@welshman/store'
import {repository, loadOne} from './core'
import {createSearch} from './util'
import {collection} from './collection'

export const profiles = withGetter(
  deriveEventsMapped<PublishedProfile>(repository, {
    filters: [{kinds: [PROFILE]}],
    eventToItem: readProfile,
    itemToEvent: item => item.event,
  })
)

export const {
  indexStore: profilesByPubkey,
  deriveItem: deriveProfile,
  loadItem: loadProfile,
} = collection({
  name: "profiles",
  store: profiles,
  getKey: profile => profile.event.pubkey,
  load: (pubkey: string, request: Partial<SubscribeRequest> = {}) =>
    loadOne({...request, filters: [{kinds: [PROFILE], authors: [pubkey]}]}),
})

export const profileSearch = derived(profiles, $profiles =>
  createSearch($profiles, {
    getValue: (profile: PublishedProfile) => profile.event.pubkey,
    fuseOptions: {
      keys: ["name", "display_name", {name: "about", weight: 0.3}],
    },
  }),
)

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey
    ? displayProfile(profilesByPubkey.get().get(pubkey), displayPubkey(pubkey))
    : ""

export const deriveProfileDisplay = (pubkey: string | undefined) =>
  pubkey
    ? derived(deriveProfile(pubkey), $profile => displayProfile($profile, displayPubkey(pubkey)))
    : readable("")
