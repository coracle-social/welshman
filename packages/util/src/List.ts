import {parseJson, ensurePlural, nth} from "@welshman/lib"
import {Address} from "./Address"
import {isShareableRelayUrl} from "./Relay"
import {Encryptable, DecryptedEvent} from "./Encryptable"

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

export const createList = ({kind, publicTags = [], privateTags = []}: List) =>
  new Encryptable({kind, tags: publicTags}, {content: JSON.stringify(privateTags)})

export const editList = ({kind, publicTags = [], privateTags = []}: PublishedList) =>
  new Encryptable({kind, tags: publicTags}, {content: JSON.stringify(privateTags)})

export const getListValues = (tagName: string | string[], list: List | undefined) => {
  const tagNames = ensurePlural(tagName)
  const allTags = [...list?.publicTags || [], ...list?.privateTags || []]
  const filteredTags = allTags.filter(t => tagNames.includes(t[0])).map(nth(1))

  return filteredTags
}
