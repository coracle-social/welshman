import {verifiedSymbol, verifyEvent as verifyEventPure} from "nostr-tools/pure"
import {setNostrWasm, verifyEvent as verifyEventWasm} from "nostr-tools/wasm"
import {initNostrWasm} from "nostr-wasm"
import {lte, pick, now} from "@welshman/lib"
import {getAddress} from "./Address.js"
import {
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

// Event template creation

export const makeEvent = (
  kind: number,
  {content = "", tags = [], created_at = now()}: MakeEventOpts = {},
) => ({kind, content, tags, created_at})

// Event signature verification

export const verifyEvent = (() => {
  let verify = verifyEventPure

  if (typeof WebAssembly === "object") {
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

export const compareEventsAsc = (a: TrustedEvent, b: TrustedEvent) =>
  a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const compareEventsDesc = (a: TrustedEvent, b: TrustedEvent) => compareEventsAsc(b, a)

export const sortEventsAsc = (events: Iterable<TrustedEvent>) => [...events].sort(compareEventsAsc)

export const sortEventsDesc = (events: Iterable<TrustedEvent>) =>
  [...events].sort(compareEventsDesc)
