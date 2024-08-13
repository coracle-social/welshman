import {fromPairs, parseJson} from "@welshman/lib"
import {getAddress, Tags} from "@welshman/util"
import type {ExtensibleTrustedEvent} from "@welshman/util"

export type Handler = {
  kind: number
  name: string
  about: string
  image: string
  identifier: string
  event: ExtensibleTrustedEvent
  website?: string
  lud16?: string
  nip05?: string
}

export const readHandlers = (event: ExtensibleTrustedEvent) => {
  const {d: identifier} = fromPairs(event.tags)
  const meta = parseJson(event.content)
  const normalizedMeta = {
    name: meta?.name || meta?.display_name || "",
    image: meta?.image || meta?.picture || "",
    about: meta?.about || "",
    website: meta?.website || "",
    lud16: meta?.lud16 || "",
    nip05: meta?.nip05 || "",
  }

  // If our meta is missing important stuff, don't bother showing it
  if (!normalizedMeta.name || !normalizedMeta.image) {
    return []
  }

  return Tags.fromEvent(event)
    .whereKey("k")
    .values()
    .valueOf()
    .map(kind => ({...normalizedMeta, kind: parseInt(kind), identifier, event})) as Handler[]
}

export const getHandlerKey = (handler: Handler) => `${handler.kind}:${getAddress(handler.event)}`

export const displayHandler = (handler?: Handler, fallback = "") => handler?.name || fallback

export const getHandlerAddress = (event: ExtensibleTrustedEvent) => {
  const tags = Tags.fromEvent(event).whereKey("a")
  const tag = tags.filter(t => t.last() === "web").first() || tags.first()

  return tag?.value()
}
