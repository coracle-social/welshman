import {derived, readable} from "svelte/store"
import {readProfile, displayProfile, displayPubkey, PROFILE} from "@welshman/util"
import {RepositoryCollection} from "./repositoryCollection.js"
import {RelayLists} from "./relayLists.js"
import type {IClient} from "./client.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), resolved through the relay-list collection at fetch time.
 */
export class Profiles extends RepositoryCollection<ReturnType<typeof readProfile>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [PROFILE]}],
      eventToItem: readProfile,
      getKey: profile => profile.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(RelayLists).makeOutboxLoader(PROFILE)(pubkey, relayHints)
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
