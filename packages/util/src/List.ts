import {parseJson, append, nthNe, nthEq} from "@welshman/lib"
import {Address} from "./Address"
import {isShareableRelayUrl} from "./Relay"
import {Encryptable, DecryptedEvent} from "./Encryptable"
import type {EncryptableUpdates} from "./Encryptable"

export type ListParams = {
  kind: number
}

export type List = ListParams & {
  publicTags: string[][]
  privateTags: string[][]
  event?: DecryptedEvent
}

export type PublishedList = Omit<List, "event"> & {
  event: DecryptedEvent
}

export const makeList = (list: ListParams & Partial<List>): List =>
  ({publicTags: [], privateTags: [], ...list})

const isValidTag = (tag: string[]) => {
  if (tag[0] === "p") return tag[1]?.length === 64
  if (tag[0] === "e") return tag[1]?.length === 64
  if (tag[0] === "a") return Address.isAddress(tag[1] || "")
  if (tag[0] === "t") return tag[1]?.length > 0
  if (tag[0] === "r") return isShareableRelayUrl(tag[1])
  if (tag[0] === "relay") return isShareableRelayUrl(tag[1])

  return true
}

export const readList = (event: DecryptedEvent): PublishedList => {
  const getTags = (tags: string[][]) => (Array.isArray(tags) ? tags.filter(isValidTag) : [])
  const privateTags = getTags(parseJson(event.plaintext?.content))
  const publicTags = getTags(event.tags)

  return {event, kind: event.kind, publicTags, privateTags}
}

export const getListTags = (list: List | undefined) =>
  [...list?.publicTags || [], ...list?.privateTags || []]

export const removeFromList = (list: List, value: string) => {
  const plaintext: EncryptableUpdates = {}
  const template = {
    kind: list.kind,
    content: list.event?.content || "",
    tags: list.publicTags.filter(nthNe(1, value)),
  }

  // Avoid redundant encrypt calls if possible
  if (list.privateTags.some(nthEq(1, value))) {
    plaintext.content = JSON.stringify(list.privateTags.filter(nthNe(1, value)))
  }

  return new Encryptable(template, plaintext)
}

export const addToListPublicly = (list: List, tag: string[]) => {
  const template = {
    kind: list.kind,
    content: list.event?.content || "",
    tags: append(tag, list.publicTags),
  }

  return new Encryptable(template, {})
}

export const addToListPrivately = (list: List, tag: string[]) => {
  const template = {
    kind: list.kind,
    tags: list.publicTags,
  }

  return new Encryptable(template, {
    content: JSON.stringify(append(tag, list.privateTags)),
  })
}
