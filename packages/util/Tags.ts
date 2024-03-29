import {EventTemplate} from 'nostr-tools'
import type {OmitStatics} from '@coracle.social/lib'
import {Fluent, last} from '@coracle.social/lib'
import {isShareableRelayUrl, normalizeRelayUrl} from './Relays'
import type {Address} from './Address'
import {encodeAddress, decodeAddress} from './Address'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'

export class Tag extends (Fluent<string> as OmitStatics<typeof Fluent<string>, 'from'>) {
  static from(xs: Iterable<string>) {
    return new Tag(Array.from(xs))
  }

  static fromAddress = (a: Address) => new Tag(["a", encodeAddress(a), a.relays[0] || ""])

  valueOf = () => this.xs

  key = () => this.xs[0]

  value = () => this.xs[1]

  mark = () => last(this.xs.slice(2))

  entry = () => this.xs.slice(0, 2)

  setKey = (k: string) => this.set(0, k)

  setValue = (v: string) => this.set(1, v)

  setMark = (m: string) => this.xs.length > 2 ? this.set(this.xs.length - 2, m) : this.append(m)

  asAddress = () => decodeAddress(this.value())

  isAddress = (kind?: number) => this.key() === "a" && this.value()?.startsWith(`${kind}:`)

  isGroup = () => this.isAddress(GROUP_DEFINITION)

  isCommunity = () => this.isAddress(COMMUNITY_DEFINITION)

  isContext = () => this.isAddress(GROUP_DEFINITION) || this.isAddress(COMMUNITY_DEFINITION)
}

export class Tags extends (Fluent<Tag> as OmitStatics<typeof Fluent<Tag>, 'from'>) {
  static from(p: Iterable<string[]>) {
    return new Tags(Array.from(p).map(Tag.from))
  }

  static fromEvent(event: Pick<EventTemplate, "tags">) {
    return Tags.from(event.tags || [])
  }

  static fromEvents(events: Pick<EventTemplate, "tags">[]) {
    return Tags.from(events.flatMap(e => e.tags || []))
  }

  // @ts-ignore
  valueOf = () => this.xs.map(tag => tag.valueOf())

  whereKey = (key: string) => this.filter(t => t.key() === key)

  whereValue = (value: string) => this.filter(t => t.value() === value)

  whereMark = (mark: string) => this.filter(t => t.mark() === mark)

  removeKey = (key: string) => this.reject(t => t.key() === key)

  removeValue = (value: string) => this.reject(t => t.value() === value)

  removeMark = (mark: string) => this.reject(t => t.mark() === mark)

  get = (key: string) => this.whereKey(key).first()

  keys = () => this.mapTo(t => t.key())

  values = (key?: string) => (key ? this.whereKey(key) : this).mapTo(t => t.value())

  marks = () => this.mapTo(t => t.mark())

  entries = () => this.mapTo(t => t.entry())

  relays = () => this.flatMap((t: Tag) => t.valueOf().filter(isShareableRelayUrl).map(url => normalizeRelayUrl(url))).uniq()

  topics = () => this.whereKey("t").values().map((t: string) => t.replace(/^#/, ""))

  ancestors = () => {
    const tags = this.filter(t => ["a", "e", "q"].includes(t.key()) && !t.isContext())
    const parentTags = tags.filter(t => ["a", "e"].includes(t.key()))
    const mentionTags = tags.whereKey("q")
    const roots: string[][] = []
    const replies: string[][] = []
    const mentions: string[][] = []

    parentTags
      .forEach((t: Tag, i: number) => {
        if (t.mark() === 'root') {
          roots.push(t.valueOf())
        } else if (t.mark() === 'reply') {
          replies.push(t.valueOf())
        } else if (t.mark() === 'mention') {
          mentions.push(t.valueOf())
        } else if (i === 0) {
          roots.push(t.valueOf())
        } else if (i === parentTags.count() - 1) {
          replies.push(t.valueOf())
        } else {
          mentions.push(t.valueOf())
        }
      })

    // Add quotes as mentions separately so positional logic above works
    mentionTags.forEach((t: Tag) => mentions.push(t.valueOf()))

    return {
      roots: Tags.from(roots),
      replies: Tags.from(replies),
      mentions: Tags.from(mentions),
    }
  }

  roots = () => this.ancestors().roots

  replies = () => this.ancestors().replies

  mentions = () => this.ancestors().mentions

  root = () => {
    const roots = this.roots()

    return roots.get("e") || roots.get("a")
  }

  reply = () => {
    const replies = this.replies()

    return replies.get("e") || replies.get("a")
  }

  parents = () => {
    const {roots, replies} = this.ancestors()

    return replies.exists() ? replies: roots
  }

  parent = () => {
    const parents = this.parents()

    return parents.get("e") || parents.get("a")
  }

  groups = () => this.whereKey("a").filter(t => t.isGroup())

  communities = () => this.whereKey("a").filter(t => t.isCommunity())

  context = () => this.whereKey("a").filter(t => t.isContext())

  asObject = () => {
    const result: Record<string, string> = {}

    for (const t of this.xs) {
      result[t.key()] = t.value()
    }

    return result
  }

  imeta = (url: string) => {
    for (const tag of this.whereKey("imeta").xs) {
      const tags = Tags.from(tag.drop(1).valueOf().map((m: string) => m.split(" ")))

      if (tags.get("url")?.value() === url) {
        return tags
      }
    }

    return null
  }

  // Generic setters

  addTag = (...args: string[]) => this.append(Tag.from(args))

  setTag = (k: string, ...args: string[]) => this.removeKey(k).addTag(k, ...args)

  // Context

  addContext = (addresses: string[]) => this.concat(addresses.map(a => Tag.from(["a", a])))

  removeContext = () => this.reject(t => t.isContext())

  setContext = (addresses: string[]) => this.removeContext().addContext(addresses)

  // Images

  addImages = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["image", tags.get("url").value()])))

  removeImages = () => this.removeKey('image')

  setImages = (imeta: Tags[]) => this.removeImages().addImages(imeta)

  // IMeta

  addIMeta = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["imeta", ...tags.valueOf().map(xs => xs.join(" "))])))

  removeIMeta = () => this.removeKey('imeta')

  setIMeta = (imeta: Tags[]) => this.removeIMeta().addIMeta(imeta)
}

