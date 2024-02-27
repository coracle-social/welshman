import type {EventTemplate} from 'nostr-tools'
import {Fluent} from './Fluent'
import type {OmitAllStatics} from './Tools'
import {last} from './Tools'
import {isShareableRelayUrl} from './Relays'
import {isCommunityAddress, isGroupAddress, isCommunityOrGroupAddress} from './Address'

export class Tag extends (Fluent<string> as OmitAllStatics<typeof Fluent<string>>) {
  static from(xs: Iterable<string>) {
    return new Tag(Array.from(xs))
  }

  valueOf = () => this.xs

  key = () => this.xs[0]

  value = () => this.xs[1]

  mark = () => last(this.xs.slice(2))

  entry = () => this.xs.slice(0, 2)
}

export class Tags extends (Fluent<Tag> as OmitAllStatics<typeof Fluent<Tag>>) {
  static from(p: Iterable<string[]>) {
    return new Tags(Array.from(p).map(Tag.from))
  }

  static fromEvent(event: EventTemplate) {
    return Tags.from(event.tags)
  }

  static fromEvents(events: Iterable<EventTemplate>) {
    return Tags.from(Array.from(events).flatMap((e: EventTemplate) => e.tags))
  }

  // @ts-ignore
  valueOf = () => this.xs.map(tag => tag.valueOf())

  whereKey = (key: string) => this.filter(t => t.key() === key)

  whereValue = (value: string) => this.filter(t => t.value() === value)

  whereMark = (mark: string) => this.filter(t => t.mark() === mark)

  keys = () => this.mapTo(t => t.key())

  values = () => this.mapTo(t => t.value())

  marks = () => this.mapTo(t => t.mark())

  entries = () => this.mapTo(t => t.entry())

  relays = () => this.flatMap((t: Tag) => t.valueOf().filter(isShareableRelayUrl)).uniq()

  topics = () => this.whereKey("t").values().map((t: string) => t.replace(/^#/, ""))

  getAncestorsLegacy(this: Tags) {
    // Legacy only supports e tags. Normalize their length to 3
    const eTags =
      this
        .whereKey("e")
        .map((t: Tag) => t.concat([""]).slice(0, 3))

    return {
      roots: eTags.slice(0, 1),
      replies: eTags.slice(-1),
      mentions: eTags.slice(1, -1),
    }
  }

  getAncestors = (key?: string) => {
    // If we have a mark, we're not using the legacy format
    if (!this.some((t: Tag) => t.count() === 4 && ["reply", "root", "mention"].includes(t.mark()))) {
      return this.getAncestorsLegacy()
    }

    const eTags = this.whereKey("e")
    const aTags = this.whereKey("a").reject((t: Tag) => isCommunityOrGroupAddress(t.value()))
    const allTags = eTags.concat(aTags.xs)

    return {
      roots: allTags.whereMark('root').map((t: Tag) => t.take(3)),
      replies: allTags.whereMark('reply').map((t: Tag) => t.take(3)),
      mentions: allTags.whereMark('mention').map((t: Tag) => t.take(3)),
    }
  }

  roots = (key?: string) => this.getAncestors(key).roots

  replies = (key?: string) => this.getAncestors(key).replies

  groups = () => this.whereKey("a").values().filter(isGroupAddress)

  communities = () => this.whereKey("a").values().filter(isCommunityAddress)

  communitiesAndGroups = () => this.whereKey("a").values().filter(isCommunityOrGroupAddress)
}
