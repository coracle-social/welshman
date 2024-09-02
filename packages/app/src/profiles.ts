import {derived} from 'svelte/store'
import {readProfile, displayProfile, displayPubkey, PROFILE} from '@welshman/util'
import {type SubscribeRequest} from "@welshman/net"
import {type PublishedProfile} from "@welshman/util"
import {deriveEventsMapped} from '@welshman/store'
import {repository, load} from './core'
import {createSearch} from './util'
import {collection} from './collection'
import {getWriteRelayUrls, loadRelaySelections} from './relaySelections'

export const profiles = deriveEventsMapped<PublishedProfile>(repository, {
  filters: [{kinds: [PROFILE]}],
  eventToItem: readProfile,
  itemToEvent: item => item.event,
})

export const {
  indexStore: profilesByPubkey,
  deriveItem: deriveProfile,
  loadItem: loadProfile,
} = collection({
  name: "profiles",
  store: profiles,
  getKey: profile => profile.event.pubkey,
  load: async (pubkey: string, hints = [], request: Partial<SubscribeRequest> = {}) => {
    const relays = getWriteRelayUrls(await loadRelaySelections(pubkey, hints))

    return load({
      ...request,
      relays: [...relays, ...hints],
      filters: [{kinds: [PROFILE], authors: [pubkey]}],
    })
  },
})

export const profileSearch = derived(profiles, $profiles =>
  createSearch($profiles, {
    getValue: (profile: PublishedProfile) => profile.event.pubkey,
    fuseOptions: {
      keys: ["name", "display_name", {name: "about", weight: 0.3}],
    },
  }),
)

export const displayProfileByPubkey = (pubkey: string) =>
  displayProfile(profilesByPubkey.get().get(pubkey), displayPubkey(pubkey))

export const deriveProfileDisplay = (pubkey: string) =>
  derived(deriveProfile(pubkey), $profile => displayProfile($profile, displayPubkey(pubkey)))
