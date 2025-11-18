import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {PublishedProfile} from "@welshman/util"
import {makeMappedCollection} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoaderWithIndexers} from "./relaySelections.js"

export const profiles = makeMappedCollection<PublishedProfile>({
  repository,
  name: "profiles",
  filters: [{kinds: [PROFILE]}],
  getKey: profile => profile.event.pubkey,
  eventToItem: event => readProfile(event),
  load: makeOutboxLoaderWithIndexers(PROFILE),
})

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey ? displayProfile(profiles.one(pubkey), displayPubkey(pubkey)) : ""

export const deriveProfileDisplay = (pubkey: string | undefined, relays: string[] = []) =>
  pubkey
    ? derived(profiles.one$(pubkey, relays), $profile =>
        displayProfile($profile, displayPubkey(pubkey)),
      )
    : readable("")
