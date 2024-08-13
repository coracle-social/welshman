import {parseJson} from "@welshman/lib"
import {Address, isShareableRelayUrl, TrustedEvent} from "@welshman/util"
import {Encryptable, DecryptedEvent} from "./util"

export type ListParams = {
  kind: number
}

export type List<E extends TrustedEvent> = ListParams & {
  publicTags: string[][]
  privateTags: string[][]
  event?: DecryptedEvent<E>
}

export type PublishedList<E extends TrustedEvent> = Omit<List<E>, "event"> & {
  event: DecryptedEvent<E>
}

export const makeList = <E extends TrustedEvent>(list: ListParams & Partial<List<E>>): List<E> =>
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

export const readList = <E extends TrustedEvent>(event: DecryptedEvent<E>): PublishedList<E> => {
  const getTags = (tags: string[][]) => (Array.isArray(tags) ? tags.filter(isValidTag) : [])
  const privateTags = getTags(parseJson(event.plaintext?.content))
  const publicTags = getTags(event.tags)

  return {event, kind: event.kind, publicTags, privateTags}
}

export const createList = <E extends TrustedEvent>({kind, publicTags = [], privateTags = []}: List<E>) =>
  new Encryptable({kind, tags: publicTags}, {content: JSON.stringify(privateTags)})

export const editList = <E extends TrustedEvent>({kind, publicTags = [], privateTags = []}: PublishedList<E>) =>
  new Encryptable({kind, tags: publicTags}, {content: JSON.stringify(privateTags)})
