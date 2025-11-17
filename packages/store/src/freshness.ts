export const freshness = new Map<string, number>()

export const getFreshnessKey = (ns: string, key: string) => `${ns}:${key}`

export const getFreshness = (ns: string, key: string) =>
  freshness.get(getFreshnessKey(ns, key)) || 0

export const setFreshness = (ns: string, key: string, ts: number) =>
  freshness.set(getFreshnessKey(ns, key), ts)
