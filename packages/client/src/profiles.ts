import {derived, readable} from "svelte/store"
import {
  readProfile,
  displayProfile,
  displayPubkey,
  isPublishedProfile,
  createProfile,
  editProfile,
  PROFILE,
} from "@welshman/util"
import type {Profile} from "@welshman/util"
import type {Maybe} from "@welshman/lib"
import {DerivedData, projection} from "./clientData.js"
import type {Projection} from "./clientData.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Thunks} from "./thunk.js"
import type {IClient} from "./client.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), resolved through the relay-list collection at fetch time.
 */
export class Profiles extends DerivedData<ReturnType<typeof readProfile>> {
  constructor(ctx: IClient) {
    super(ctx, {
      filters: [{kinds: [PROFILE]}],
      eventToItem: readProfile,
      getKey: profile => profile.event.pubkey,
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.ctx.use(Network).loadUsingOutbox(pubkey, {kinds: [PROFILE]}, relayHints)
  }

  publish = (profile: Profile) => {
    const router = this.ctx.use(Router)
    const relays = router.merge([router.Index(), router.FromUser()]).getUrls()
    const event = isPublishedProfile(profile) ? editProfile(profile) : createProfile(profile)

    return this.ctx.use(Thunks).publish({event, relays})
  }

  display = (pubkey: string | undefined, ...args: any[]): Projection<string> => {
    const read = ($profile: Maybe<ReturnType<typeof readProfile>>) =>
      pubkey ? displayProfile($profile, displayPubkey(pubkey)) : ""

    return projection(
      pubkey ? derived(this.one(pubkey, ...args), read) : readable(""),
      () => read(pubkey ? this.get(pubkey) : undefined),
    )
  }
}
