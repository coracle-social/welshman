import {debounce} from 'throttle-debounce'
import {derived, readable} from 'svelte/store'
import {dec} from '@welshman/lib'
import {readProfile, displayProfile, displayPubkey, PROFILE} from '@welshman/util'
import type {SubscribeRequestWithHandlers} from "@welshman/net"
import type {PublishedProfile, TrustedEvent} from "@welshman/util"
import {deriveEventsMapped, withGetter} from '@welshman/store'
import {repository, load} from './core'
import {createSearch} from './util'
import {collection} from './collection'
import {loadRelaySelections} from './relaySelections'
import {wotGraph} from './wot'

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
  load: async (pubkey: string, request: Partial<SubscribeRequestWithHandlers> = {}) => {
    const filters = [{kinds: [PROFILE], authors: [pubkey]}]

    // Attempt to load the user profile right away, regardless of whether we have relays,
    // since profiles are crucial to UX
    load({...request, filters})

    // Load relay selections as quickly as possible, moving on to retrying profiles with
    // better selections the moment we have a result, even if it's outdated
    await new Promise<void>(resolve => {
      loadRelaySelections(pubkey, {
        onEvent: (event: TrustedEvent) => {
          resolve()
        }
      })
    })

    await load({...request, filters})
  },
})

export const searchProfiles = debounce(500, (search: string) => {
  if (search.length > 2) {
    load({filters: [{kinds: [PROFILE], search}]})
  }
})

export const profileSearch = derived(profiles, $profiles =>
  createSearch($profiles, {
    onSearch: searchProfiles,
    getValue: (profile: PublishedProfile) => profile.event.pubkey,
    sortFn: ({score, item}) => {
      if (score && score > 0.1) return -score!

      const wotScore = wotGraph.get().get(item.event.pubkey) || 0

      return score ? dec(score) * wotScore : -wotScore
    },
    fuseOptions: {
      keys: ["name", "display_name", {name: "about", weight: 0.3}],
      threshold: 0.3,
      shouldSort: false,
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
