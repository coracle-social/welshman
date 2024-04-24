import {EventTemplate} from 'nostr-tools'
import type {OmitStatics} from '@welshman/lib'
import {Fluent, ensurePlural, last} from '@welshman/lib'
import {isShareableRelayUrl, normalizeRelayUrl} from './Relays'
import type {Address} from './Address'
import {encodeAddress, decodeAddress} from './Address'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'

export class Tag extends (Fluent<string> as OmitStatics<typeof Fluent<string>, 'from'>) {
  static from = (xs: Iterable<string>) => new Tag(Array.from(xs))

  static fromId = (id: string) => new Tag(["e", id])

  static fromTopic = (topic: string) => new Tag(["t", topic])

  static fromPubkey = (pubkey: string) => new Tag(["p", pubkey])

  static fromAddress = (address: Address) => new Tag(["a", encodeAddress(address), address.relays[0] || ""])

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
  static from = (p: Iterable<Tag>) => new Tags(Array.from(p))

  static wrap = (p: Iterable<string[]>) => new Tags(Array.from(p).map(Tag.from))

  static fromEvent = (event: Pick<EventTemplate, "tags">) => Tags.wrap(event.tags || [])

  static fromEvents = (events: Pick<EventTemplate, "tags">[]) => Tags.wrap(events.flatMap(e => e.tags || []))

  static fromIMeta = (imeta: string[]) => Tags.wrap(imeta.map((m: string) => m.split(" ")))

  unwrap = () => this.xs.map(tag => tag.valueOf())

  whereKey = (key: string) => this.filter(t => t.key() === key)

  whereValue = (value: string) => this.filter(t => t.value() === value)

  whereMark = (mark: string) => this.filter(t => t.mark() === mark)

  filterByKey = (keys: string[]) => this.filter(t => keys.includes(t.key()))

  filterByValue = (values: string[]) => this.filter(t => values.includes(t.value()))

  filterByMark = (marks: string[]) => this.filter(t => marks.includes(t.mark()))

  rejectByKey = (keys: string[]) => this.reject(t => keys.includes(t.key()))

  rejectByValue = (values: string[]) => this.reject(t => values.includes(t.value()))

  rejectByMark = (marks: string[]) => this.reject(t => marks.includes(t.mark()))

  get = (key: string) => this.whereKey(key).first()

  keys = () => this.mapTo(t => t.key())

  values = (key?: string | string[]) =>
    (key ? this.filterByKey(ensurePlural(key)) : this).mapTo(t => t.value())

  marks = () => this.mapTo(t => t.mark())

  entries = () => this.mapTo(t => t.entry())

  relays = () => this.flatMap((t: Tag) => t.valueOf().filter(isShareableRelayUrl).map(url => normalizeRelayUrl(url))).uniq()

  topics = () => this.whereKey("t").values().map((t: string) => t.replace(/^#/, ""))

  ancestors = (x?: boolean) => {
    const tags = this.filterByKey(["a", "e", "q"]).reject(t => t.isContext())
    const mentionTags = tags.whereKey("q")
    const roots: string[][] = []
    const replies: string[][] = []
    const mentions: string[][] = []

    const dispatchTags = (thisTags: Tags) =>
      thisTags.forEach((t: Tag, i: number) => {
        if (t.mark() === 'root') {
          roots.push(t.valueOf())
        } else if (t.mark() === 'reply') {
          replies.push(t.valueOf())
        } else if (t.mark() === 'mention') {
          mentions.push(t.valueOf())
        } else if (i === thisTags.count() - 1) {
          replies.push(t.valueOf())
        } else if (i === 0) {
          roots.push(t.valueOf())
        } else {
          mentions.push(t.valueOf())
        }
      })

    // Add different types separately so positional logic works
    dispatchTags(tags.whereKey("e"))
    dispatchTags(tags.whereKey("a"))
    mentionTags.forEach((t: Tag) => mentions.push(t.valueOf()))

    return {
      roots: Tags.wrap(roots),
      replies: Tags.wrap(replies),
      mentions: Tags.wrap(mentions),
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

    return replies.exists() ? replies : roots
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
      const tags = Tags.fromIMeta(tag.drop(1).valueOf())

      if (tags.get("url")?.value() === url) {
        return tags
      }
    }

    return null
  }

  // Generic setters

  addTag = (...args: string[]) => this.append(Tag.from(args))

  setTag = (k: string, ...args: string[]) => this.rejectByKey([k]).addTag(k, ...args)

  // Context

  addContext = (addresses: string[]) => this.concat(addresses.map(a => Tag.from(["a", a])))

  removeContext = () => this.reject(t => t.isContext())

  setContext = (addresses: string[]) => this.removeContext().addContext(addresses)

  // Images

  addImages = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["image", tags.get("url").value()])))

  removeImages = () => this.rejectByKey(['image'])

  setImages = (imeta: Tags[]) => this.removeImages().addImages(imeta)

  // IMeta

  addIMeta = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["imeta", ...tags.valueOf().map(xs => xs.join(" "))])))

  removeIMeta = () => this.rejectByKey(['imeta'])

  setIMeta = (imeta: Tags[]) => this.removeIMeta().addIMeta(imeta)
}

