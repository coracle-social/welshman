import {verifiedSymbol} from 'nostr-tools'
import {verifyEvent, getEventHash} from 'nostr-tools'
import {cached, pick, now} from '@welshman/lib'
import {Tags} from './Tags'
import {getAddress} from './Address'
import {isEphemeralKind, isReplaceableKind, isPlainReplaceableKind, isParameterizedReplaceableKind} from './Kinds'

export type EventContent = {
  tags: string[][]
  content: string
}

export type EventTemplate = EventContent & {
  kind: number
  created_at: number
}

export type OwnedEvent = EventTemplate & {
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

export type ExtensibleTrustedEvent = TrustedEvent & Record<string, any>

export type CreateEventOpts = {
  content?: string
  tags?: string[][]
  created_at?: number
}

export const createEvent = (kind: number, {content = "", tags = [], created_at = now()}: CreateEventOpts) =>
  ({kind, content, tags, created_at})

export const isEventTemplate = (e: EventTemplate): e is EventTemplate =>
  Boolean(typeof e.kind === "number" && e.tags && typeof e.content === "string" && e.created_at)

export const isOwnedEvent = (e: OwnedEvent): e is OwnedEvent =>
  Boolean(isEventTemplate(e) && e.pubkey)

export const isHashedEvent = (e: HashedEvent): e is HashedEvent =>
  Boolean(isOwnedEvent(e) && e.id)

export const isSignedEvent = (e: TrustedEvent): e is SignedEvent =>
  Boolean(isHashedEvent(e) && e.sig)

export const isUnwrappedEvent = (e: TrustedEvent): e is UnwrappedEvent =>
  Boolean(isHashedEvent(e) && e.wrap)

export const isTrustedEvent = (e: TrustedEvent): e is TrustedEvent =>
  isSignedEvent(e) || isUnwrappedEvent(e)

export const asEventTemplate = (e: EventTemplate): EventTemplate =>
  pick(['kind', 'tags', 'content', 'created_at'], e)

export const asOwnedEvent = (e: OwnedEvent): OwnedEvent =>
  pick(['kind', 'tags', 'content', 'created_at', 'pubkey'], e)

export const asHashedEvent = (e: HashedEvent): HashedEvent =>
  pick(['kind', 'tags', 'content', 'created_at', 'pubkey', 'id'], e)

export const asSignedEvent = (e: SignedEvent): SignedEvent =>
  pick(['kind', 'tags', 'content', 'created_at', 'pubkey', 'id', 'sig'], e)

export const asUnwrappedEvent = (e: UnwrappedEvent): UnwrappedEvent =>
  pick(['kind', 'tags', 'content', 'created_at', 'pubkey', 'id', 'wrap'], e)

export const asTrustedEvent = (e: TrustedEvent): TrustedEvent =>
  pick(['kind', 'tags', 'content', 'created_at', 'pubkey', 'id', 'sig', 'wrap'], e)

export const hasValidSignature = cached<string, boolean, [SignedEvent]>({
  maxSize: 10000,
  getKey: ([e]: [SignedEvent]) => {
    try {
      return [getEventHash(e), e.sig].join(":")
    } catch (err) {
      return 'invalid'
    }
  },
  getValue: ([e]: [SignedEvent]) => {
    try {
      return verifyEvent(e)
    } catch (err) {
      return false
    }
  },
})

export const getIdentifier = (e: EventTemplate) => e.tags.find(t => t[0] === 'd')?.[1]

export const getIdOrAddress = (e: HashedEvent) => isReplaceable(e) ? getAddress(e) : e.id

export const getIdAndAddress = (e: HashedEvent) => isReplaceable(e) ? [e.id, getAddress(e)] : [e.id]

export const isEphemeral = (e: EventTemplate) => isEphemeralKind(e.kind)

export const isReplaceable = (e: EventTemplate) => isReplaceableKind(e.kind)

export const isPlainReplaceable = (e: EventTemplate) => isPlainReplaceableKind(e.kind)

export const isParameterizedReplaceable = (e: EventTemplate) => isParameterizedReplaceableKind(e.kind)

export const isChildOf = (child: EventTemplate, parent: HashedEvent) => {
  const {roots, replies} = Tags.fromEvent(child).ancestors()
  const parentIds = (replies.exists() ? replies : roots).values().valueOf()

  return getIdAndAddress(parent).some(x => parentIds.includes(x))
}
