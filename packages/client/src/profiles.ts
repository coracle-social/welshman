import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import type {ClientContext} from "./client.js"
import type {RelayLists} from "./relayLists.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), so it depends on the relay-list collection.
 */
export class Profiles extends RepositoryCollection<ReturnType<typeof readProfile>> {
  constructor(
    ctx: ClientContext,
    readonly relayLists: RelayLists,
  ) {
    super(ctx, {
      filters: [{kinds: [PROFILE]}],
      eventToItem: readProfile,
      getKey: profile => profile.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.relayLists.makeOutboxLoader(PROFILE)(pubkey, relayHints)
  }

  display = (pubkey: string | undefined) =>
    pubkey ? displayProfile(this.get(pubkey), displayPubkey(pubkey)) : ""

  deriveDisplay = (pubkey: string | undefined, ...args: any[]) =>
    pubkey
      ? derived(this.derive(pubkey, ...args), $profile =>
          displayProfile($profile, displayPubkey(pubkey)),
        )
      : readable("")
}
