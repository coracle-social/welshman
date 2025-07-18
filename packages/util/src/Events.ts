import {verifiedSymbol, verifyEvent as verifyEventPure} from "nostr-tools/pure"
import {setNostrWasm, verifyEvent as verifyEventWasm} from "nostr-tools/wasm"
import {initNostrWasm} from "nostr-wasm"
import {mapVals, first, pick, now} from "@welshman/lib"
import {getReplyTags, getCommentTags, getReplyTagValues, getCommentTagValues} from "./Tags.js"
import {getAddress, Address} from "./Address.js"
import {
  COMMENT,
  isEphemeralKind,
  isReplaceableKind,
  isPlainReplaceableKind,
  isParameterizedReplaceableKind,
} from "./Kinds.js"

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

export type UnwrappedEvent = HashedEvent & {
  wrap: SignedEvent
}

export type TrustedEvent = HashedEvent & {
  sig?: string
  wrap?: SignedEvent
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

  return (event: TrustedEvent) =>
    Boolean(event.sig && (event[verifiedSymbol] || verify(event as SignedEvent)))
})()

// Type guards

export const isEventTemplate = (e: EventTemplate): e is EventTemplate =>
  Boolean(typeof e.kind === "number" && Array.isArray(e.tags) && typeof e.content === "string")

export const isStampedEvent = (e: StampedEvent): e is StampedEvent =>
  Boolean(isEventTemplate(e) && e.created_at >= 0)

export const isOwnedEvent = (e: OwnedEvent): e is OwnedEvent =>
  Boolean(isStampedEvent(e) && e.pubkey)

export const isHashedEvent = (e: HashedEvent): e is HashedEvent => Boolean(isOwnedEvent(e) && e.id)

export const isSignedEvent = (e: TrustedEvent): e is SignedEvent =>
  Boolean(isHashedEvent(e) && e.sig)

export const isUnwrappedEvent = (e: TrustedEvent): e is UnwrappedEvent =>
  Boolean(isHashedEvent(e) && e.wrap)

export const isTrustedEvent = (e: TrustedEvent): e is TrustedEvent =>
  isSignedEvent(e) || isUnwrappedEvent(e)

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

export const asUnwrappedEvent = (e: UnwrappedEvent): UnwrappedEvent =>
  pick(["kind", "tags", "content", "created_at", "pubkey", "id", "wrap"], e)

export const asTrustedEvent = (e: TrustedEvent): TrustedEvent =>
  pick(["kind", "tags", "content", "created_at", "pubkey", "id", "sig", "wrap"], e)

// Utilities for working with events

export const getIdentifier = (e: EventTemplate) => e.tags.find(t => t[0] === "d")?.[1]

export const getIdOrAddress = (e: HashedEvent) => (isReplaceable(e) ? getAddress(e) : e.id)

export const getIdAndAddress = (e: HashedEvent) =>
  isReplaceable(e) ? [e.id, getAddress(e)] : [e.id]

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
