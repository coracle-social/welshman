import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {PublishedProfile} from "@welshman/util"
import {Collection2, CollectionRepositoryBackend} from "@welshman/store"
import {repository} from "./core.js"
import {makeOutboxLoaderWithIndexers} from "./relaySelections.js"

export const profiles = new Collection2({
  backend: new CollectionRepositoryBackend<PublishedProfile>('profiles', {
    repository,
    filters: [{kinds: [PROFILE]}],
    fetch: makeOutboxLoaderWithIndexers(PROFILE),
    eventToItem: readProfile,
    itemToEvent: profile => profile.event,
    getKey: profile => profile.event.pubkey,
  }),
})

export const displayProfileByPubkey = (pubkey: string | undefined) =>
  pubkey ? displayProfile(profiles.one(pubkey), displayPubkey(pubkey)) : ""

export const deriveProfileDisplay = (pubkey: string | undefined, relays: string[] = []) =>
  pubkey
    ? derived(profiles.one$(pubkey, relays), $profile =>
        displayProfile($profile, displayPubkey(pubkey)),
      )
    : readable("")
