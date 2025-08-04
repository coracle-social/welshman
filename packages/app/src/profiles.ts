import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {PublishedProfile} from "@welshman/util"
import {deriveEventsMapped, collection, withGetter} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoaderWithIndexers} from "./relaySelections.js"

export const profiles = withGetter(
  deriveEventsMapped<PublishedProfile>(repository, {
    filters: [{kinds: [PROFILE]}],
    eventToItem: readProfile,
    itemToEvent: item => item.event,
  }),
)

export const {
  indexStore: profilesByPubkey,
  deriveItem: deriveProfile,
  loadItem: loadProfile,
} = collection({
  name: "profiles",
  store: profiles,
  getKey: profile => profile.event.pubkey,
  load: makeOutboxLoaderWithIndexers(PROFILE),
})

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey ? displayProfile(profilesByPubkey.get().get(pubkey), displayPubkey(pubkey)) : ""

export const deriveProfileDisplay = (pubkey: string | undefined, relays: string[] = []) =>
  pubkey
    ? derived(deriveProfile(pubkey, relays), $profile =>
        displayProfile($profile, displayPubkey(pubkey)),
      )
    : readable("")
