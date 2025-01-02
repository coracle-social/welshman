import {matchFilter as nostrToolsMatchFilter} from "nostr-tools/filter"
import {
  without,
  uniqBy,
  prop,
  mapVals,
  shuffle,
  avg,
  hash,
  groupBy,
  randomId,
  uniq,
} from "@welshman/lib"
import type {HashedEvent, TrustedEvent, SignedEvent} from "./Events.js"
import {isReplaceableKind} from "./Kinds.js"
import {Address, getAddress} from "./Address.js"

export const EPOCH = 1609459200

export const neverFilter = {ids: []}

export type Filter = {
  ids?: string[]
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  search?: string
  [key: `#${string}`]: string[]
}

export const matchFilter = <E extends HashedEvent>(filter: Filter, event: E) => {
  if (!nostrToolsMatchFilter(filter, event as unknown as SignedEvent)) {
    return false
  }

  if (filter.search) {
    const content = event.content.toLowerCase()
    const terms = filter.search.toLowerCase().split(/\s+/g)

    for (const term of terms) {
      if (content.includes(term)) {
        return true
      }

      return false
    }
  }

  return true
}

export const matchFilters = <E extends HashedEvent>(filters: Filter[], event: E) => {
  for (const filter of filters) {
    if (matchFilter(filter, event)) {
      return true
    }
  }

  return false
}

export const getFilterId = (filter: Filter) => {
  const keys = Object.keys(filter)

  keys.sort()

  const parts = []
  for (const k of keys) {
    const v = filter[k as keyof Filter]
    const s = Array.isArray(v) ? v.join(",") : v

    parts.push(`${k}:${s}`)
  }

  return hash(parts.join("|"))
}

export const calculateFilterGroup = ({since, until, limit, search, ...filter}: Filter) => {
  const group = Object.keys(filter)

  if (since) group.push(`since:${since}`)
  if (until) group.push(`until:${until}`)
  if (limit) group.push(`limit:${randomId()}`)
  if (search) group.push(`search:${search}`)

  return group.sort().join("-")
}

export const unionFilters = (filters: Filter[]) => {
  const result = []

  // Group, but also get unique filters by ids because duplicates can come through subscribe
  for (const group of groupBy(calculateFilterGroup, uniqBy(getFilterId, filters)).values()) {
    const newFilter: Record<string, any> = {}

    for (const k of Object.keys(group[0])) {
      if (["since", "until", "limit", "search"].includes(k)) {
        newFilter[k] = (group[0] as Record<string, any>)[k]
      } else {
        newFilter[k] = uniq(group.flatMap(prop(k)))
      }
    }

    result.push(newFilter as Filter)
  }

  return result
}

export const intersectFilters = (groups: Filter[][]) => {
  let result = groups[0]

  for (const filters of groups.slice(1)) {
    result = result.flatMap(f1 => {
      return filters.map(f2 => {
        const f3: Filter = {}

        for (const k of uniq([...Object.keys(f1), ...Object.keys(f2)]) as (keyof Filter)[]) {
          if (k === "since" || k === "limit") {
            f3[k] = Math.max(f1[k] || 0, f2[k] || 0)
          } else if (k === "until") {
            f3[k] = Math.min(f1[k] || f2[k] || 0, f2[k] || f1[k] || 0)
          } else if (k === "search") {
            if (f1[k] && f2[k] && f1[k] !== f2[k]) {
              f3[k] = [f1[k], f2[k]].join(" ")
            } else {
              f3[k] = f1[k] || f2[k]
            }
          } else {
            f3[k] = uniq([...(f1[k] || []), ...(f2[k] || [])]) as any[]
          }
        }

        return f3
      })
    })
  }

  return unionFilters(result)
}

export const getIdFilters = (idsOrAddresses: string[]) => {
  const ids = []
  const aFilters = []

  for (const idOrAddress of idsOrAddresses) {
    if (Address.isAddress(idOrAddress)) {
      const {kind, pubkey, identifier} = Address.from(idOrAddress)

      if (identifier) {
        aFilters.push({kinds: [kind], authors: [pubkey], "#d": [identifier]})
      } else {
        aFilters.push({kinds: [kind], authors: [pubkey]})
      }
    } else {
      ids.push(idOrAddress)
    }
  }

  const filters = unionFilters(aFilters)

  if (ids.length > 0) {
    filters.push({ids})
  }

  return filters
}

export const getReplyFilters = (events: TrustedEvent[], filter: Filter = {}) => {
  const a = []
  const e = []

  for (const event of events) {
    e.push(event.id)

    if (isReplaceableKind(event.kind)) {
      a.push(getAddress(event))
    }

    if (event.wrap) {
      e.push(event.wrap.id)
    }
  }

  const filters = []

  if (a.length > 0) {
    filters.push({...filter, "#a": a})
  }

  if (e.length > 0) {
    filters.push({...filter, "#e": e})
  }

  return filters
}

export const addRepostFilters = (filters: Filter[]) =>
  filters.flatMap(original => {
    const filterChunk = [original]

    if (!original.kinds) {
      filterChunk.push({...original, kinds: [6, 16]})
    } else {
      if (original.kinds.includes(1)) {
        filterChunk.push({...original, kinds: [6]})
      }

      const otherKinds = without([1], original.kinds)

      if (otherKinds.length > 0) {
        filterChunk.push({...original, kinds: [16], "#k": otherKinds.map(String)})
      }
    }

    return filterChunk
  })

export const getFilterGenerality = (filter: Filter) => {
  if (filter.ids || filter["#e"] || filter["#a"]) {
    return 0
  }

  const hasTags = Object.keys(filter).find((k: string) => k.startsWith("#"))

  if (filter.authors && hasTags) {
    return 0.2
  }

  if (filter.authors) {
    return Math.min(1, filter.authors.length / 300)
  }

  return 1
}

export const guessFilterDelta = (filters: Filter[], max = 60 * 60 * 24) =>
  Math.round(max * Math.max(0.01, 1 - avg(filters.map(getFilterGenerality))))

// If a filter is specifying ids, we know how many results to expect
export const getFilterResultCardinality = (filter: Filter) => {
  if (filter.ids) {
    return filter.ids.length
  }

  return null
}

export const trimFilter = (filter: Filter): Filter =>
  mapVals(
    v => (Array.isArray(v) && v.length > 1000 ? shuffle(v as string[]).slice(0, 1000) : v),
    filter,
  ) as Filter

export const trimFilters = (filters: Filter[]) => filters.map(trimFilter)
