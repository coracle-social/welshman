import {fromPairs, last, first, parseJson} from "@welshman/lib"
import {getAddress} from "./Address.js"
import {getAddressTags, getKindTagValues} from "./Tags.js"
import type {TrustedEvent} from "./Events.js"

export type Handler = {
  kind: number
  name: string
  about: string
  image: string
  identifier: string
  event: TrustedEvent
  website?: string
  lud16?: string
  nip05?: string
}

export const readHandlers = (event: TrustedEvent) => {
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

  return getKindTagValues(event.tags).map(kind => ({
    ...normalizedMeta,
    kind,
    identifier,
    event,
  })) as Handler[]
}

export const getHandlerKey = (handler: Handler) => `${handler.kind}:${getAddress(handler.event)}`

export const displayHandler = (handler?: Handler, fallback = "") => handler?.name || fallback

export const getHandlerAddress = (event: TrustedEvent) => {
  const tags = getAddressTags(event.tags)
  const tag = tags.find(t => last(t) === "web") || first(tags)

  return tag?.[1]
}
