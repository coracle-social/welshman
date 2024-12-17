import Fuse from "fuse.js"
import type {IFuseOptions, FuseResult} from "fuse.js"
import {debounce} from "throttle-debounce"
import {derived} from "svelte/store"
import {dec, sortBy} from "@welshman/lib"
import {PROFILE} from "@welshman/util"
import {throttled} from "@welshman/store"
import type {PublishedProfile} from "@welshman/util"
import {load} from "./subscribe.js"
import {wotGraph} from "./wot.js"
import {profiles} from "./profiles.js"
import {topics} from "./topics.js"
import type {Topic} from "./topics.js"
import {relays} from "./relays.js"
import type {Relay} from "./relays.js"
import {handlesByNip05} from "./handles.js"

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

export const searchProfiles = debounce(500, (search: string) => {
  if (search.length > 2) {
    load({filters: [{kinds: [PROFILE], search}]})
  }
})

export const profileSearch = derived(
  [throttled(800, profiles), throttled(800, handlesByNip05)],
  ([$profiles, $handlesByNip05]) => {
    // Remove invalid nip05's from profiles
    const options = $profiles.map(p => {
      const isNip05Valid = !p.nip05 || $handlesByNip05.get(p.nip05)?.pubkey === p.event.pubkey

      return isNip05Valid ? p : {...p, nip05: ""}
    })

    return createSearch(options, {
      onSearch: searchProfiles,
      getValue: (profile: PublishedProfile) => profile.event.pubkey,
      sortFn: ({score, item}) => {
        if (score && score > 0.1) return -score!

        const wotScore = wotGraph.get().get(item.event.pubkey) || 0

        return score ? dec(score) * wotScore : -wotScore
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

export const topicSearch = derived(topics, $topics =>
  createSearch($topics, {
    getValue: (topic: Topic) => topic.name,
    fuseOptions: {keys: ["name"]},
  }),
)

export const relaySearch = derived(relays, $relays =>
  createSearch($relays, {
    getValue: (relay: Relay) => relay.url,
    fuseOptions: {
      keys: ["url", "name", {name: "description", weight: 0.3}],
    },
  }),
)
