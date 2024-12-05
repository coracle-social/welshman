import type {OmitStatics} from "@welshman/lib"
import {Fluent, uniq, uniqBy, mapVals, nth, nthEq, ensurePlural} from "@welshman/lib"
import {isRelayUrl, isShareableRelayUrl, normalizeRelayUrl} from "./Relay"
import {Address} from "./Address"

export class Tag extends (Fluent<string> as OmitStatics<typeof Fluent<string>, "from">) {
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
}

export class Tags extends (Fluent<Tag> as OmitStatics<typeof Fluent<Tag>, "from">) {
  static from = (p: Iterable<Tag>) => new Tags(Array.from(p))

  static wrap = (p: Iterable<string[]>) => new Tags(Array.from(p).map(Tag.from))

  static fromEvent = (event: {tags: string[][]}) => Tags.wrap(event?.tags || [])

  static fromEvents = (events: {tags: string[][]}[]) => Tags.wrap(events.flatMap(e => e.tags || []))

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

  relays = () =>
    this.flatMap((t: Tag) =>
      t
        .valueOf()
        .filter(isRelayUrl)
        .map(url => normalizeRelayUrl(url))
    ).uniq()

  topics = () =>
    this.whereKey("t")
      .values()
      .map((t: string) => t.replace(/^#/, ""))

  ancestors = (x?: boolean) => {
    const {roots, replies, mentions} = getAncestorTags(this.unwrap())

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

  // Images

  addImages = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["image", tags.get("url").value()])))

  removeImages = () => this.rejectByKey(["image"])

  setImages = (imeta: Tags[]) => this.removeImages().addImages(imeta)

  // IMeta

  addIMeta = (imeta: Tags[]) =>
    this.concat(imeta.map(tags => Tag.from(["imeta", ...tags.valueOf().map(xs => xs.join(" "))])))

  removeIMeta = () => this.rejectByKey(["imeta"])

  setIMeta = (imeta: Tags[]) => this.removeIMeta().addIMeta(imeta)
}

// New, simpler version

export const getTags = (types: string | string[], tags: string[][]) => {
  types = ensurePlural(types)

  return tags.filter(t => types.includes(t[0]))
}

export const getTagValues = (types: string | string[], tags: string[][]) =>
  getTags(types, tags).map(nth(1))

export const getEventTags = (tags: string[][]) =>
  tags.filter(t => ["e"].includes(t[0]) && t[1].length === 64)

export const getEventTagValues = (tags: string[][]) => getEventTags(tags).map(nth(1))

export const getAddressTags = (tags: string[][]) =>
  tags.filter(t => ["a"].includes(t[0]) && Address.isAddress(t[1]))

export const getAddressTagValues = (tags: string[][]) => getAddressTags(tags).map(nth(1))

export const getPubkeyTags = (tags: string[][]) =>
  tags.filter(t => ["p"].includes(t[0]) && t[1].length === 64)

export const getPubkeyTagValues = (tags: string[][]) => getPubkeyTags(tags).map(nth(1))

export const getTopicTags = (tags: string[][]) => tags.filter(t => ["t"].includes(t[0]))

export const getTopicTagValues = (tags: string[][]) => getTopicTags(tags).map(nth(1))

export const getRelayTags = (tags: string[][]) =>
  tags.filter(t => ["r", "relay"].includes(t[0]) && isRelayUrl(t[1] || ""))

export const getRelayTagValues = (tags: string[][]) => getRelayTags(tags).map(nth(1))

export const getGroupTags = (tags: string[][]) =>
  tags.filter(t => ["h", "group"].includes(t[0]) && t[1] && isRelayUrl(t[2] || ""))

export const getGroupTagValues = (tags: string[][]) => getGroupTags(tags).map(nth(1))

export const getKindTags = (tags: string[][]) =>
  tags.filter(t => ["k"].includes(t[0]) && t[1].match(/^\d+$/))

export const getKindTagValues = (tags: string[][]) => getKindTags(tags).map(t => parseInt(t[1]))

export const getAncestorTags = (tags: string[][]) => {
  const validTags = tags.filter(t => ["a", "e", "q"].includes(t[0]))
  const mentionTags = validTags.filter(nthEq(0, "q"))
  const roots: string[][] = []
  const replies: string[][] = []
  const mentions: string[][] = []

  const dispatchTags = (thisTags: string[][]) =>
    thisTags.forEach((t: string[], i: number) => {
      if (t[3] === "root") {
        if (validTags.filter(nthEq(3, "reply")).length === 0) {
          replies.push(t)
        } else {
          roots.push(t)
        }
      } else if (t[3] === "reply") {
        replies.push(t)
      } else if (t[3] === "mention") {
        mentions.push(t)
      } else if (i === thisTags.length - 1) {
        replies.push(t)
      } else if (i === 0) {
        roots.push(t)
      } else {
        mentions.push(t)
      }
    })

  // Add different types separately so positional logic works
  dispatchTags(validTags.filter(nthEq(0, "e")))
  dispatchTags(validTags.filter(nthEq(0, "a")).filter(t => Boolean(t[3])))
  mentionTags.forEach((t: string[]) => mentions.push(t))

  return {roots, replies, mentions}
}

export const getAncestorTagValues = (tags: string[][]) =>
  mapVals(tags => tags.map(nth(1)), getAncestorTags(tags))

export const getRelayHints = (tags: string[][]) =>
  uniq(tags.flatMap(t => t.slice(2).filter(isShareableRelayUrl)))

export const uniqTags = (tags: string[][]) => uniqBy(t => t.join(":"), tags)
