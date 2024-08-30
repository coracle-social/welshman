import {writable} from 'svelte/store'
import {assoc} from '@welshman/lib'
import {withGetter} from '@welshman/store'

export const freshness = withGetter(writable<Record<string, number>>({}))

export const getFreshnessKey = (ns: string, key: string) => `${ns}:${key}`

export const getFreshness = (ns: string, key: string) =>
  freshness.get()[getFreshnessKey(ns, key)] || 0

export const setFreshness = (ns: string, key: string, ts: number) =>
  freshness.update(assoc(getFreshnessKey(ns, key), ts))

export const setFreshnessBulk = (ns: string, updates: Record<string, number>) =>
  freshness.update($freshness => {
    for (const [key, ts] of Object.entries(updates)) {
      $freshness[key] = ts
    }

    return $freshness
  })
