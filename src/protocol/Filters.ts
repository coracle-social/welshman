import type {Event} from 'nostr-tools'
import {matchFilter as nostrToolsMatchFilter} from 'nostr-tools'

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

export const matchFilter = (filter: Filter, event: Event) => {
  if (!nostrToolsMatchFilter(filter, event)) {
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

export const matchFilters = (filters: Filter[], event: Event) => {
  for (const filter of filters) {
    if (matchFilter(filter, event)) {
      return true
    }
  }

  return false
}
