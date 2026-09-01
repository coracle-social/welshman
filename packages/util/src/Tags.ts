import {ensurePlural, isHex32, removeUndefined} from "@welshman/lib"
import {isRelayUrl, normalizeRelayUrl} from "./Relay.js"
import {Address} from "./Address.js"
import {isKind, normalizeKind} from "./Kinds.js"
import {normalizeTopic} from "./Topics.js"

export type TagSpec<T = string> = {
  keys: string[]
  matchValue?: (value: string) => boolean
  normalizeValue?: (value: string) => T
}

// prettier-ignore
export const tagSpec = <T=string>(
  keys: string | string[],
  matchValue?: (value: string) => boolean,
  normalizeValue?: (value: string) => T,
): TagSpec<T> => ({keys: ensurePlural(keys), matchValue, normalizeValue})

export const hexTags = (keys: string | string[]) => tagSpec(keys, isHex32)

export const kindTags = (keys: string | string[]) => tagSpec(keys, isKind, normalizeKind)

export const topicTags = (keys: string | string[]) => tagSpec(keys, undefined, normalizeTopic)

export const addressTags = (keys: string | string[]) =>
  tagSpec(keys, value => Address.isAddress(value))

export const relayTags = (keys: string | string[]) => tagSpec(keys, isRelayUrl, normalizeRelayUrl)

export const tagMatcher = (spec: TagSpec<any>) => (tag: string[]) => {
  if (!spec.keys.includes(tag[0])) return false
  if (spec.matchValue && (!tag[1] || !spec.matchValue(tag[1]))) return false

  return true
}

export const matchTags = <T>(spec: TagSpec<T>, tags: string[][]) => tags.filter(tagMatcher(spec))

export const matchTag = <T>(spec: TagSpec<T>, tags: string[][]) => tags.find(tagMatcher(spec))

export const tagValueExtractor =
  <T>(spec: TagSpec<T>) =>
  (tag: string[]): T =>
    (spec.normalizeValue ? spec.normalizeValue(tag[1]) : tag[1]) as T

export const tagValues = <T>(spec: TagSpec<T>, tags: string[][]): NonNullable<T>[] =>
  removeUndefined(matchTags(spec, tags).map(tagValueExtractor(spec)))

export const tagValue = <T>(spec: TagSpec<T>, tags: string[][]): T | undefined => {
  const tag = matchTag(spec, tags)

  return tag ? tagValueExtractor(spec)(tag) : undefined
}
