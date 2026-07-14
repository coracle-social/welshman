import {derived, readable} from "svelte/store"
import type {Readable} from "svelte/store"
import {debounce} from "throttle-debounce"
import {dec, inc} from "@welshman/lib"
import type {Maybe} from "@welshman/lib"
import {PROFILE, searchRelays} from "@welshman/util"
import {Profile, ProfileReader, ProfileWriter, displayPubkey} from "@welshman/domain"
import {throttled} from "@welshman/store"
import {DerivedPlugin, projection, createSearch} from "./base.js"
import type {Projection, Search} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Domain} from "./domain.js"
import {Handles} from "./handles.js"
import {Wot} from "./wot.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * Kind-0 profiles, keyed by pubkey. Loaded via the outbox model (the author's
 * write relays), resolved through the relay-list collection at fetch time.
 */
export class Profiles extends DerivedPlugin<ProfileReader> {
  profileSearch: Readable<Search<string, ProfileReader>>

  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PROFILE]}],
      eventToItem: app.use(Domain).reader(Profile),
      getKey: profile => profile.author(),
    })

    this.profileSearch = readable(this.makeSearch([]), set =>
      throttled(800, this.all.$).subscribe($profiles => set(this.makeSearch($profiles))),
    )
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [PROFILE]}, relayHints)
  }

  update = async (fn: (writer: ProfileWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(Profile, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  display = (pubkey: string | undefined, ...args: any[]): Projection<string> => {
    const read = ($profile: Maybe<ProfileReader>) =>
      pubkey ? ($profile?.display() ?? displayPubkey(pubkey)) : ""

    return projection(pubkey ? derived(this.one(pubkey, ...args), read) : readable(""), () =>
      read(pubkey ? this.get(pubkey) : undefined),
    )
  }

  private makeSearch = ($profiles = this.all.get()): Search<string, ProfileReader> => {
    return createSearch($profiles, {
      onSearch: debounce(500, async (search: string) => {
        if (search.length > 2) {
          const scenario = await this.app.use(Router).resolve([searchRelays()])

          this.app.use(Network).load({
            filters: [{kinds: [PROFILE], search}],
            relays: scenario.getUrls(),
          })
        }
      }),
      getValue: (profile: ProfileReader) => profile.author(),
      sortFn: ({score = 1, item}) => {
        const wot = this.app.use(Wot)
        const wotScore = wot.graph.get().get(item.author()) || 0

        return dec(score) * inc(wotScore / (wot.max.get() || 1))
      },
      fuseOptions: {
        keys: ["nip05", {name: "name", weight: 0.8}, {name: "about", weight: 0.3}],
        threshold: 0.3,
        shouldSort: false,
        // Read fields off the domain reader's parsed `values`; only expose a
        // nip05 that's verified against the currently-loaded handle (anti-spoofing).
        getFn: (profile: ProfileReader, path) => {
          const key = Array.isArray(path) ? path[0] : path

          if (key === "nip05") {
            const nip05 = profile.nip05()

            return nip05 && this.app.use(Handles).get(nip05)?.pubkey === profile.author()
              ? nip05
              : ""
          }

          return profile.values[key] ?? ""
        },
      },
    })
  }
}
