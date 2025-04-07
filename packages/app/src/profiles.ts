import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {load, MultiRequestOptions} from "@welshman/net"
import {PublishedProfile} from "@welshman/util"
import {deriveEventsMapped, withGetter} from "@welshman/store"
import {repository} from "./core.js"
import {Router} from "./router.js"
import {collection} from "./collection.js"
import {loadWithAsapMetaRelayUrls} from "./relaySelections.js"

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
  load: (pubkey: string, relays: string[]) =>
    loadWithAsapMetaRelayUrls(pubkey, relays, [{kinds: [PROFILE], authors: [pubkey]}])
})

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey ? displayProfile(profilesByPubkey.get().get(pubkey), displayPubkey(pubkey)) : ""

export const deriveProfileDisplay = (pubkey: string | undefined) =>
  pubkey
    ? derived(deriveProfile(pubkey), $profile => displayProfile($profile, displayPubkey(pubkey)))
    : readable("")
