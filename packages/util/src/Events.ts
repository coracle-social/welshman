import {verifiedSymbol, verifyEvent as verifyEventPure} from "nostr-tools/pure"
import {setNostrWasm, verifyEvent as verifyEventWasm} from "nostr-tools/wasm"
import {initNostrWasm} from "nostr-wasm"
import {mapVals, sortBy, lte, first, pick, now} from "@welshman/lib"
import {getReplyTags, getCommentTags, getReplyTagValues, getCommentTagValues} from "./Tags.js"
import {getAddress, Address} from "./Address.js"
import {
  COMMENT,
  isEphemeralKind,
  isReplaceableKind,
  isPlainReplaceableKind,
  isParameterizedReplaceableKind,
} from "./Kinds.js"

export {verifiedSymbol}

export type EventContent = {
  tags: string[][]
  content: string
}

export type EventTemplate = EventContent & {
  kind: number
}

export type StampedEvent = EventTemplate & {
  created_at: number
}

export type OwnedEvent = StampedEvent & {
  pubkey: string
}

export type HashedEvent = OwnedEvent & {
  id: string
}

export type SignedEvent = HashedEvent & {
  sig: string
  [verifiedSymbol]?: boolean
}

export type TrustedEvent = HashedEvent & {
  sig?: string
  [verifiedSymbol]?: boolean
}

export type MakeEventOpts = {
  content?: string
  tags?: string[][]
  created_at?: number
}

const canUseWasm = () => {
  if (typeof WebAssembly !== "object") return false
  try {
    // Probe minimal WASM for runtime support.
    const module_bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
    const module = new WebAssembly.Module(module_bytes)
    new WebAssembly.Instance(module)
    return true
  } catch {
    return false
  }
}

// Event template creation

export const makeEvent = (
  kind: number,
  {content = "", tags = [], created_at = now()}: MakeEventOpts = {},
) => ({kind, content, tags, created_at})

// Event signature verification

export const verifyEvent = (() => {
  let verify = verifyEventPure

  if (canUseWasm()) {
    initNostrWasm().then(
      nostrWasm => {
        setNostrWasm(nostrWasm)
        verify = verifyEventWasm
      },
      e => {
        console.warn(e)
      },
    )
  }

  return (event: TrustedEvent) => {
    if (!isSignedEvent(event)) return false
    if (event[verifiedSymbol]) return true

    return verify(event)
  }
})()

// Type guards

export const isEventTemplate = (e: EventTemplate): e is EventTemplate => {
  if (!e) return false
  if (e.kind % 1 !== 0) return false
  if (typeof e.content !== "string") return false

  return e.tags?.every?.(t => t?.every?.(x => typeof x === "string"))
}

export const isStampedEvent = (e: StampedEvent): e is StampedEvent =>
  Boolean(isEventTemplate(e) && e.created_at >= 0 && e.created_at % 1 === 0)

export const isOwnedEvent = (e: OwnedEvent): e is OwnedEvent =>
  Boolean(isStampedEvent(e) && typeof e.pubkey === "string" && e.pubkey.length === 64)

export const isHashedEvent = (e: HashedEvent): e is HashedEvent =>
  Boolean(isOwnedEvent(e) && typeof e.id === "string" && e.id.length === 64)

export const isSignedEvent = (e: TrustedEvent): e is SignedEvent =>
  Boolean(isHashedEvent(e) && typeof e.sig === "string" && e.sig.length > 0)

// Type coercion and attribute stripping

export const asEventTemplate = (e: EventTemplate): EventTemplate =>
  pick(["kind", "tags", "content"], e)

export const asStampedEvent = (e: StampedEvent): StampedEvent =>
  pick(["kind", "tags", "content", "created_at"], e)

export const asOwnedEvent = (e: OwnedEvent): OwnedEvent =>
  pick(["kind", "tags", "content", "created_at", "pubkey"], e)

export const asHashedEvent = (e: HashedEvent): HashedEvent =>
  pick(["kind", "tags", "content", "created_at", "pubkey", "id"], e)

export const asSignedEvent = (e: SignedEvent): SignedEvent =>
  pick(["kind", "tags", "content", "created_at", "pubkey", "id", "sig"], e)

// Utilities for working with events

export const getIdentifier = (e: EventTemplate) => e.tags.find(t => t[0] === "d")?.[1]

export const getIdOrAddress = (e: HashedEvent) => (isReplaceable(e) ? getAddress(e) : e.id)

export const getIdAndAddress = (e: HashedEvent) =>
  isReplaceable(e) ? [e.id, getAddress(e)] : [e.id]

export const deduplicateEvents = (events: TrustedEvent[]) => {
  const eventsByKey = new Map<string, TrustedEvent>()

  for (const event of events) {
    const key = getIdOrAddress(event)

    if (lte(eventsByKey.get(key)?.created_at, event.created_at)) {
      eventsByKey.set(key, event)
    }
  }

  return Array.from(eventsByKey.values())
}

export const isEphemeral = (e: EventTemplate) => isEphemeralKind(e.kind)

export const isReplaceable = (e: EventTemplate) => isReplaceableKind(e.kind)

export const isPlainReplaceable = (e: EventTemplate) => isPlainReplaceableKind(e.kind)

export const isParameterizedReplaceable = (e: EventTemplate) =>
  isParameterizedReplaceableKind(e.kind)

export const getAncestorTags = ({kind, tags}: EventTemplate) =>
  kind === COMMENT ? getCommentTags(tags) : getReplyTags(tags)

export const getAncestors = ({kind, tags}: EventTemplate) =>
  kind === COMMENT ? getCommentTagValues(tags) : getReplyTagValues(tags)

export const getParentIdsAndAddrs = (event: EventTemplate) => {
  const {roots, replies} = getAncestors(event)

  return replies.length > 0 ? replies : roots
}

export const getParentIdOrAddr = (event: EventTemplate) => first(getParentIdsAndAddrs(event))

export const getParentIds = (event: EventTemplate) => {
  const {roots, replies} = mapVals(
    ids => ids.filter(id => !Address.isAddress(id)),
    getAncestors(event),
  )

  return replies.length > 0 ? replies : roots
}

export const getParentId = (event: EventTemplate) => first(getParentIds(event))

export const getParentAddrs = (event: EventTemplate) => {
  const {roots, replies} = mapVals(
    ids => ids.filter(id => Address.isAddress(id)),
    getAncestors(event),
  )

  return replies.length > 0 ? replies : roots
}

export const getParentAddr = (event: EventTemplate) => first(getParentAddrs(event))

export const isChildOf = (child: EventTemplate, parent: HashedEvent) => {
  const idsAndAddrs = getParentIdsAndAddrs(child)

  return getIdAndAddress(parent).some(x => idsAndAddrs.includes(x))
}

export const sortEventsAsc = (events: Iterable<TrustedEvent>) => sortBy(e => e.created_at, events)

export const sortEventsDesc = (events: Iterable<TrustedEvent>) => sortBy(e => -e.created_at, events)
