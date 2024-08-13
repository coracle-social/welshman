import {fromPairs, parseJson} from "@welshman/lib"
import {getAddress, Tags} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"

export type Handler<E extends TrustedEvent> = {
  kind: number
  name: string
  about: string
  image: string
  identifier: string
  event: E
  website?: string
  lud16?: string
  nip05?: string
}

export const readHandlers = <E extends TrustedEvent>(event: E) => {
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
    .map(kind => ({...normalizedMeta, kind: parseInt(kind), identifier, event})) as Handler<E>[]
}

export const getHandlerKey = <E extends TrustedEvent>(handler: Handler<E>) => `${handler.kind}:${getAddress(handler.event)}`

export const displayHandler = <E extends TrustedEvent>(handler?: Handler<E>, fallback = "") => handler?.name || fallback

export const getHandlerAddress = <E extends TrustedEvent>(event: E) => {
  const tags = Tags.fromEvent(event).whereKey("a")
  const tag = tags.filter(t => t.last() === "web").first() || tags.first()

  return tag?.value()
}
