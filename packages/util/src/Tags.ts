import {EventTemplate} from 'nostr-tools/pure'
import type {OmitStatics} from '@welshman/lib'
import {Fluent, ensurePlural} from '@welshman/lib'
import {isShareableRelayUrl, normalizeRelayUrl} from './Relay'
import {Address, isContextAddress} from './Address'
import {GROUP, COMMUNITY} from './Kinds'

export class Tag extends (Fluent<string> as OmitStatics<typeof Fluent<string>, 'from'>) {
  static from = (xs: Iterable<string>) => new Tag(Array.from(xs))

  static fromId = (id: string) => new Tag(["e", id])

  static fromIdentifier = (identifier: string) => new Tag(["d", identifier])

  static fromTopic = (topic: string) => new Tag(["t", topic])

  static fromPubkey = (pubkey: string) => new Tag(["p", pubkey])

  static fromAddress = (address: string, relay = "") => new Tag(["a", address, relay])

  key = () => this.xs[0]

  value = () => this.xs[1]

  entry = () => this.xs.slice(0, 2)

  setKey = (k: string) => this.set(0, k)

  setValue = (v: string) => this.set(1, v)

  isAddress = (kind?: number) => this.key() === "a" && this.value()?.startsWith(`${kind}:`)

  isGroup = () => this.isAddress(GROUP)

  isCommunity = () => this.isAddress(COMMUNITY)

  isContext = () => this.isAddress(GROUP) || this.isAddress(COMMUNITY)
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

  filterByKey = (keys: string[]) => this.filter(t => keys.includes(t.key()))

  filterByValue = (values: string[]) => this.filter(t => values.includes(t.value()))

  rejectByKey = (keys: string[]) => this.reject(t => keys.includes(t.key()))

  rejectByValue = (values: string[]) => this.reject(t => values.includes(t.value()))

  get = (key: string) => this.whereKey(key).first()

  keys = () => this.mapTo(t => t.key())

  values = (key?: string | string[]) =>
    (key ? this.filterByKey(ensurePlural(key)) : this).mapTo(t => t.value())

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
        if (t.nth(3) === 'root') {
          if (tags.filter(t => t.nth(3) === "reply").count() === 0) {
            replies.push(t.valueOf())
          } else {
            roots.push(t.valueOf())
          }
        } else if (t.nth(3) === 'reply') {
          replies.push(t.valueOf())
        } else if (t.nth(3) === 'mention') {
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
    dispatchTags(tags.whereKey("a").filter(t => Boolean(t.nth(3))))
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

// New, simpler version

export const getTags =
  (types: string[], testValue?: (v: string) => boolean) =>
  (tags: string[][]) =>
    tags.filter(t => types.includes(t[0]) && (!testValue || testValue(t[1] || "")))

export const getTagValues = (types: string[], testValue?: (v: string) => boolean) => {
  const _getTags = getTags(types, testValue)

  return (tags: string[][]) => _getTags(tags).map(t => t[1] || "")
}

export const getTagValue = (types: string[], testValue?: (v: string) => boolean) => {
  const _getTagValues = getTagValues(types, testValue)

  return (tags: string[][]) => _getTagValues(tags)[0]
}

export const getEventTags = getTags(["e"], id => id.length === 64)

export const getEventTagValues = getTagValues(["e"], id => id.length === 64)

export const getAddressTags = getTags(["a"], Address.isAddress)

export const getAddressTagValues = getTagValues(["a"], Address.isAddress)

export const getContextTagValues = (tags: string[][]) =>
  getAddressTagValues(tags).filter(isContextAddress)

export const getPubkeyTags = getTags(["p"], pk => pk.length === 64)

export const getPubkeyTagValues = getTagValues(["p"], pk => pk.length === 64)

export const getRelayTags = getTags(["r", "relay"], isShareableRelayUrl)

export const getRelayTagValues = getTagValues(["r", "relay"], isShareableRelayUrl)

export const getGroupTags = getTags(["h", "group"], h => Boolean(h.match(/^(.+)'(.+)$/)))

export const getGroupTagValues = getTagValues(["h", "group"], h => Boolean(h.match(/^(.+)'(.+)$/)))
