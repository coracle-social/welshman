import type {Event, EventTemplate, UnsignedEvent} from 'nostr-tools'
import {verifyEvent, getEventHash} from 'nostr-tools'
import {cached} from "./LRUCache"
import {now} from './Tools'
import {Address} from './Address'
import {isEphemeralKind, isReplaceableKind, isPlainReplaceableKind, isParameterizedReplaceableKind} from './Kinds'

export type Rumor = Pick<Event, 'kind' | 'tags' | 'content' | 'created_at' | 'pubkey' | 'id'>

export type CreateEventOpts = {
  content?: string
  tags?: string[][]
  created_at?: number
}

export const createEvent = (kind: number, {content = "", tags = [], created_at = now()}: CreateEventOpts) =>
  ({kind, content, tags, created_at})

export const asEventTemplate = ({kind, tags, content, created_at}: EventTemplate): EventTemplate =>
  ({kind, tags, content, created_at})

export const asUnsignedEvent = ({kind, tags, content, created_at, pubkey}: UnsignedEvent): UnsignedEvent =>
  ({kind, tags, content, created_at, pubkey})

export const asRumor = ({kind, tags, content, created_at, pubkey, id}: Rumor): Rumor =>
  ({kind, tags, content, created_at, pubkey, id})

export const hasValidSignature = cached<string, boolean, [Event]>({
  maxSize: 10000,
  getKey: ([e]: [Event]) => {
    try {
      return [getEventHash(e), e.sig].join(":")
    } catch (err) {
      return 'invalid'
    }
  },
  getValue: ([e]: [Event]) => {
    try {
      return verifyEvent(e)
    } catch (err) {
      return false
    }
  },
})

export const getAddress = (e: UnsignedEvent) => Address.fromEvent(e, []).asRaw()

export const getIdOrAddress = (e: Rumor) => isReplaceable(e) ? getAddress(e) : e.id

export const getIdAndAddress = (e: Rumor) => isReplaceable(e) ? [e.id, getAddress(e)] : [e.id]

export const isEphemeral = (e: EventTemplate) => isEphemeralKind(e.kind)

export const isReplaceable = (e: EventTemplate) => isReplaceableKind(e.kind)

export const isPlainReplaceable = (e: EventTemplate) => isPlainReplaceableKind(e.kind)

export const isParameterizedReplaceable = (e: EventTemplate) => isParameterizedReplaceableKind(e.kind)

