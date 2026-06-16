import Fuse from "fuse.js"
import type {IFuseOptions, FuseResult} from "fuse.js"
import {debounce} from "throttle-debounce"
import {derived} from "svelte/store"
import type {Readable} from "svelte/store"
import {dec, inc, sortBy} from "@welshman/lib"
import {PROFILE} from "@welshman/util"
import type {PublishedProfile, RelayProfile} from "@welshman/util"
import {throttled, deriveItems} from "@welshman/store"
import type {IClient} from "./client.js"
import {Networking} from "./networking.js"
import {Router} from "./router.js"
import {Profiles} from "./profiles.js"
import {Topics} from "./topics.js"
import type {Topic} from "./topics.js"
import {Relays} from "./relays.js"
import {Handles} from "./handles.js"
import {Wot} from "./wot.js"

export type SearchOptions<V, T> = {
  getValue: (item: T) => V
  fuseOptions?: IFuseOptions<T>
  onSearch?: (term: string) => void
  sortFn?: (items: FuseResult<T>) => any
}

export type Search<V, T> = {
  options: T[]
  getValue: (item: T) => V
  getOption: (value: V) => T | undefined
  searchOptions: (term: string) => T[]
  searchValues: (term: string) => V[]
}

export const createSearch = <V, T>(options: T[], opts: SearchOptions<V, T>): Search<V, T> => {
  const fuse = new Fuse(options, {...opts.fuseOptions, includeScore: true})
  const map = new Map<V, T>(options.map(item => [opts.getValue(item), item]))

  const search = (term: string) => {
    opts.onSearch?.(term)

    let results = term ? fuse.search(term) : options.map(item => ({item}) as FuseResult<T>)

    if (opts.sortFn) {
      results = sortBy(opts.sortFn, results)
    }

    return results.map(result => result.item)
  }

  return {
    options,
    getValue: opts.getValue,
    getOption: (value: V) => map.get(value),
    searchOptions: (term: string) => search(term),
    searchValues: (term: string) => search(term).map(opts.getValue),
  }
}

/**
 * Reactive fuzzy searches over the client's profiles, topics, and relays.
 * `profileSearch` blends fuse scores with web-of-trust weight (via `Wot`) and
 * fires a debounced NIP-50 network search through the client's loader.
 */
export class Searches {
  profileSearch: Readable<Search<string, PublishedProfile>>
  topicSearch: Readable<Search<string, Topic>>
  relaySearch: Readable<Search<string, RelayProfile>>

  constructor(readonly ctx: IClient) {
    this.profileSearch = derived(
      [throttled(800, this.ctx.use(Profiles).all), throttled(800, this.ctx.use(Handles))],
      ([$profiles, $handlesByNip05]) => {
        // Remove invalid nip05's from profiles
        const options = $profiles.map(p => {
          const isNip05Valid = !p.nip05 || $handlesByNip05.get(p.nip05)?.pubkey === p.event.pubkey

          return isNip05Valid ? p : {...p, nip05: ""}
        })

        return createSearch(options, {
          onSearch: this.searchProfiles,
          getValue: (profile: PublishedProfile) => profile.event.pubkey,
          sortFn: ({score = 1, item}) => {
            const wotScore = this.ctx.use(Wot).getWotGraph().get(item.event.pubkey) || 0

            return dec(score) * inc(wotScore / (this.ctx.use(Wot).getMaxWot() || 1))
          },
          fuseOptions: {
            keys: [
              "nip05",
              {name: "name", weight: 0.8},
              {name: "display_name", weight: 0.5},
              {name: "about", weight: 0.3},
            ],
            threshold: 0.3,
            shouldSort: false,
          },
        })
      },
    )

    this.topicSearch = derived(this.ctx.use(Topics).all, $topics =>
      createSearch($topics, {
        getValue: (topic: Topic) => topic.name,
        fuseOptions: {keys: ["name"]},
      }),
    )

    this.relaySearch = derived(deriveItems(this.ctx.use(Relays)), $relays =>
      createSearch($relays, {
        getValue: (relay: RelayProfile) => relay.url,
        fuseOptions: {
          keys: ["url", "name", {name: "description", weight: 0.3}],
        },
      }),
    )
  }

  searchProfiles = debounce(500, (search: string) => {
    if (search.length > 2) {
      this.ctx.use(Networking).load({
        filters: [{kinds: [PROFILE], search}],
        relays: this.ctx.use(Router).Search().getUrls(),
      })
    }
  })
}
