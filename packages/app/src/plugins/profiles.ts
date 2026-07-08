import {derived, readable} from "svelte/store"
import {PROFILE} from "@welshman/util"
import type {Maybe} from "@welshman/lib"
import {Profile, ProfileReader, ProfileBuilder, displayPubkey} from "@welshman/domain"
import {DerivedPlugin, projection} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), resolved through the relay-list collection at fetch time.
 */
export class Profiles extends DerivedPlugin<ProfileReader> {
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

  update = async (fn: (builder: ProfileBuilder) => void) => {
    const user = User.require(this.app)
    const builder = Profile.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }

  display = (pubkey: string | undefined, ...args: any[]): Projection<string> => {
    const read = ($profile: Maybe<ProfileReader>) =>
      pubkey ? ($profile?.display() ?? displayPubkey(pubkey)) : ""

    return projection(pubkey ? derived(this.one(pubkey, ...args), read) : readable(""), () =>
      read(pubkey ? this.get(pubkey) : undefined),
    )
  }
}
