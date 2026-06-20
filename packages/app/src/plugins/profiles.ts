import {derived, readable} from "svelte/store"
import {PROFILE} from "@welshman/util"
import type {Maybe} from "@welshman/lib"
import {Profile, ProfileBuilder, displayPubkey} from "@welshman/domain"
import {DerivedPlugin, projection} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Thunks} from "./thunk.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), resolved through the relay-list collection at fetch time.
 */
export class Profiles extends DerivedPlugin<Profile> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PROFILE]}],
      eventToItem: Profile.factory(app.user?.signer),
      getKey: profile => profile.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [PROFILE]}, relayHints)
  }

  // Publish the app user's kind-0, merging `values` over their current profile
  // (preserving any unknown metadata fields and source tags).
  publish = async (values: Record<string, any>) => {
    const user = User.require(this.app)
    const router = this.app.use(Router)
    const relays = router.merge([router.Index(), router.FromUser()]).getUrls()
    const builder = new ProfileBuilder(this.get(user.pubkey)).update(values)
    const event = await builder.toTemplate()

    return this.app.use(Thunks).publish({event, relays})
  }

  display = (pubkey: string | undefined, ...args: any[]): Projection<string> => {
    const read = ($profile: Maybe<Profile>) =>
      pubkey ? ($profile?.display() ?? displayPubkey(pubkey)) : ""

    return projection(pubkey ? derived(this.one(pubkey, ...args), read) : readable(""), () =>
      read(pubkey ? this.get(pubkey) : undefined),
    )
  }
}
