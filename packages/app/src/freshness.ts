import {writable} from "svelte/store"
import {assoc, batch} from "@welshman/lib"
import {withGetter} from "@welshman/store"

export type FreshnessUpdate = {
  ns: string
  key: string
  ts: number
}

export const freshness = withGetter(writable<Record<string, number>>({}))

export const getFreshnessKey = (ns: string, key: string) => `${ns}:${key}`

export const getFreshness = (ns: string, key: string) =>
  freshness.get()[getFreshnessKey(ns, key)] || 0

export const setFreshnessImmediate = ({ns, key, ts}: FreshnessUpdate) =>
  freshness.update(assoc(getFreshnessKey(ns, key), ts))

export const setFreshnessThrottled = batch(100, (updates: FreshnessUpdate[]) =>
  freshness.update($freshness => {
    for (const {ns, key, ts} of updates) {
      $freshness[getFreshnessKey(ns, key)] = ts
    }

    return $freshness
  }),
)
