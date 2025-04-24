import {now, uniq, displayList} from "@welshman/lib"
import {
  FeedType,
  Feed,
  AddressFeed,
  AuthorFeed,
  CreatedAtFeed,
  DVMFeed,
  DifferenceFeed,
  IDFeed,
  IntersectionFeed,
  GlobalFeed,
  KindFeed,
  ListFeed,
  LabelFeed,
  WOTFeed,
  RelayFeed,
  ScopeFeed,
  SearchFeed,
  TagFeed,
  UnionFeed,
} from "./core.js"
import {getFeedArgs} from "./utils.js"

export const displayAddressFeed = (feed: AddressFeed) => {
  const n = getFeedArgs(feed).length

  return `${n} replaceable {n === 1 ? 'event' : 'events'}`
}

export const displayAuthorFeed = (feed: AuthorFeed) => {
  const n = getFeedArgs(feed).length

  return `events from ${n} replaceable {n === 1 ? 'person' : 'people'}`
}

export const displayCreatedAtFeed = (feed: CreatedAtFeed) => {
  const items = getFeedArgs(feed)
  const descriptions: string[] = []

  for (const {since, until, relative = []} of items) {
    const parts: string[] = []

    if (since) {
      const timestamp = relative.includes("since") ? now() - since : since
      parts.push(`after ${new Date(timestamp * 1000).toLocaleString()}`)
    }

    if (until) {
      const timestamp = relative.includes("until") ? now() - until : until
      parts.push(`before ${new Date(timestamp * 1000).toLocaleString()}`)
    }

    if (parts.length > 0) {
      descriptions.push(parts.join(" and "))
    }
  }

  if (descriptions.length === 0) {
    return "events from any time"
  }

  return `events ${displayList(descriptions, "or")}`
}

export const displayDVMFeed = (feed: DVMFeed) => {
  const items = getFeedArgs(feed)
  const descriptions: string[] = []

  for (const {kind, tags = [], relays = []} of items) {
    const parts: string[] = []

    parts.push(`kind ${kind}`)

    if (tags.length > 0) {
      parts.push(`with ${tags.length} tag${tags.length === 1 ? "" : "s"}`)
    }

    if (relays.length > 0) {
      parts.push(`from ${displayList(relays)}`)
    }

    descriptions.push(parts.join(" "))
  }

  return `events from DVM requests of ${displayList(descriptions)}`
}

export const displayDifferenceFeed = (feed: DifferenceFeed) => {
  const [base, ...excluded] = getFeedArgs(feed)

  return `all ${displayFeed(base)}, excluding ${displayList(excluded.map(displayFeed))}`
}

export const displayIDFeed = (feed: IDFeed) => `${getFeedArgs(feed).length} events`

export const displayIntersectionFeed = (feed: IntersectionFeed) =>
  `events matching ${displayList(getFeedArgs(feed).map(displayFeed))}`

export const displayGlobalFeed = (feed: GlobalFeed) => "anything"

export const displayKindFeed = (feed: KindFeed) =>
  `events of kind ${displayList(getFeedArgs(feed))}`

export const displayListFeed = (feed: ListFeed) => {
  const addresses = uniq(getFeedArgs(feed).flatMap(({addresses}) => addresses))

  return `events from ${addresses.length} list${addresses.length === 1 ? "" : "s"}`
}

export const displayLabelFeed = (feed: LabelFeed) => {
  const items = getFeedArgs(feed)
  const descriptions: string[] = []

  for (const item of items) {
    const parts: string[] = []

    if (item.authors?.length) {
      parts.push(`by ${item.authors.length} author${item.authors.length === 1 ? "" : "s"}`)
    }

    const tags = Object.entries(item)
      .filter(([key]) => key.startsWith("#"))
      .map(([key, values]) => `${key}=${displayList(values as string[])}`)

    if (tags.length) {
      parts.push(`with tags ${displayList(tags)}`)
    }

    if (item.relays?.length) {
      parts.push(`from ${displayList(item.relays)}`)
    }

    descriptions.push(parts.join(" "))
  }

  return `events ${displayList(descriptions)}`
}

export const displayWOTFeed = (feed: WOTFeed) => {
  const descriptions = getFeedArgs(feed).map(({min = 0, max = 1}) =>
    min === max ? `WOT score of ${min}` : `WOT score between ${min} and ${max}`,
  )

  return `Events from authors with ${displayList(descriptions)}`
}

export const displayRelayFeed = (feed: RelayFeed) => `events from ${displayList(getFeedArgs(feed))}`

export const displayScopeFeed = (feed: ScopeFeed) =>
  `events from ${displayList(getFeedArgs(feed).map(s => s.toLowerCase()))}`

export const displaySearchFeed = (feed: SearchFeed) =>
  `events matching ${displayList(getFeedArgs(feed).map(term => `"${term}"`))}`

export const displayTagFeed = (feed: TagFeed) => {
  const [key, ...values] = getFeedArgs(feed)

  return `events with ${key} tag matching ${displayList(values, "or")}`
}

export const displayUnionFeed = (feed: UnionFeed) =>
  `all ${displayList(getFeedArgs(feed).map(displayFeed))}`

export const displayFeed = (feed: Feed): string => {
  switch (feed[0]) {
    case FeedType.Address:
      return displayAddressFeed(feed)
    case FeedType.Author:
      return displayAuthorFeed(feed)
    case FeedType.CreatedAt:
      return displayCreatedAtFeed(feed)
    case FeedType.DVM:
      return displayDVMFeed(feed)
    case FeedType.Difference:
      return displayDifferenceFeed(feed)
    case FeedType.ID:
      return displayIDFeed(feed)
    case FeedType.Intersection:
      return displayIntersectionFeed(feed)
    case FeedType.Global:
      return displayGlobalFeed(feed)
    case FeedType.Kind:
      return displayKindFeed(feed)
    case FeedType.List:
      return displayListFeed(feed)
    case FeedType.Label:
      return displayLabelFeed(feed)
    case FeedType.WOT:
      return displayWOTFeed(feed)
    case FeedType.Relay:
      return displayRelayFeed(feed)
    case FeedType.Scope:
      return displayScopeFeed(feed)
    case FeedType.Search:
      return displaySearchFeed(feed)
    case FeedType.Tag:
      return displayTagFeed(feed)
    case FeedType.Union:
      return displayUnionFeed(feed)
    default:
      return "[unknown feed type]"
  }
}

export const displayFeeds = (feeds: Feed[]) => displayList(feeds.map(displayFeed))
