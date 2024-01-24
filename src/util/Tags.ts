import type {Event} from 'nostr-tools'
import {Tag} from './Tag'
import {Fluent} from './Fluent'
import type {OmitStatics} from './misc'
import {isIterable, uniq} from './misc'
import {isShareableRelay} from './nostr'
import {isCommunityAddress, isGroupAddress, isCommunityOrGroupAddress} from './kinds'

export class Tags extends (Fluent<Tag> as OmitStatics<typeof Fluent<Tag>, 'from'>) {
  static from(p: Iterable<Tag | string[]>) {
    return new Tags(Array.from(p).map(Tag.from))
  }

  static fromEvent(event: Event) {
    return Tags.from(event.tags)
  }

  static fromEvents(events: Event[]) {
    return Tags.from(events.flatMap((e: Event) => e?.tags))
  }

  // General purpose filters

  whereKey = (key: string) => this.filter(t => t.key() === key)

  whereValue = (value: string) => this.filter(t => t.value() === value)

  whereMark = (mark: string) => this.filter(t => t.mark() === mark)

  // General purpose methods that return a list of values

  keys = () => new Fluent(this.parts.map(t => t.key()))

  values = () => new Fluent(this.parts.map(t => t.value()))

  marks = () => new Fluent(this.parts.map(t => t.mark()))

  entries = () => new Fluent(this.parts.map(t => t.entry()))
}

export type CoercibleToTags = Event | Iterable<Event> | Tags | Tag | Tag[] | string[] | Iterable<string[]>

export const coerceToTags = (x: CoercibleToTags) => {
  const xs = isIterable(x) ? Array.from(x as Iterable<any>) : [x]

  if (xs.length === 0) {
    return new Tags(xs)
  }

  if (xs[0] instanceof Event) {
    return Tags.fromEvents(xs)
  }

  if (xs[0] instanceof Array) {
    return Tags.from(xs)
  }

  if (typeof xs[0] === 'string') {
    return Tags.from([xs])
  }

  throw new Error('Received invalid value to coerceToTags: ${x}')
}

export const getRelays = (x: CoercibleToTags) =>
  uniq(Array.from(coerceToTags(x)).flatMap((t: Tag) => Array.from(t)).filter(isShareableRelay))

export const getTopics = (x: CoercibleToTags) =>
  Array.from(coerceToTags(x).whereKey("t").values()).map((t: string) => t.replace(/^#/, ""))

export const getPubkeys = (x: CoercibleToTags) =>
  Array.from(coerceToTags(x).whereKey("p").values())

export const getUrls = (x: CoercibleToTags) =>
  Array.from(coerceToTags(x).whereKey("r").values())

export const getAncestorsLegacy = (x: CoercibleToTags) => {
  // Legacy only supports e tags. Normalize their length to 3
  const eTags = Tags.from(
    coerceToTags(x).whereKey("e").map((t: Tag) => {
      while (t.count() < 3) {
        t.append("")
      }

      return t.slice(0, 3)
    })
  )

  return {
    roots: eTags.slice(0, 1),
    replies: eTags.slice(-1),
    mentions: eTags.slice(1, -1),
  }
}

type GetAncestorsReturn = {
  roots: Tags
  replies: Tags
  mentions: Tags
}

export const getAncestors = (x: CoercibleToTags, key?: string): GetAncestorsReturn => {
  const tags = coerceToTags(x)

  // If we have a mark, we're not using the legacy format
  if (!tags.some((t: Tag) => t.count() === 4 && ["reply", "root", "mention"].includes(t.mark()))) {
    return getAncestorsLegacy(tags)
  }

  const eTags = tags.whereKey("e")
  const aTags = tags.whereKey("a").reject((t: Tag) => isCommunityOrGroupAddress(t.value()))
  const allTags = coerceToTags([...eTags, ...aTags])

  return {
    roots: allTags.whereMark('root').take(3),
    replies: allTags.whereMark('reply').take(3),
    mentions: allTags.whereMark('mention').take(3),
  }
}

export const getRoots = (x: CoercibleToTags, key?: string) =>
  getAncestors(x, key).roots

export const getReplies = (x: CoercibleToTags, key?: string) =>
  getAncestors(x, key).replies

export const getGroups = (x: CoercibleToTags) =>
  coerceToTags(x).whereKey("a").values().filter(isGroupAddress)

export const getCommunities = (x: CoercibleToTags) =>
  coerceToTags(x).whereKey("a").values().filter(isCommunityAddress)

export const getCommunitiesAndGroups = (x: CoercibleToTags) =>
  coerceToTags(x).whereKey("a").values().filter(isCommunityOrGroupAddress)

export const getRoot = (x: CoercibleToTags, key?: string) =>
  getRoots(x, key).values().first()

export const getReply = (x: CoercibleToTags, key?: string) =>
  getReplies(x, key).values().first()

export const getRootHints = (x: CoercibleToTags, key?: string) =>
  getRelays(getRoots(x, key))

export const getReplyHints = (x: CoercibleToTags, key?: string) =>
  getRelays(getReplies(x, key))
