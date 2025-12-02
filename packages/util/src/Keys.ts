import {schnorr} from "@noble/curves/secp256k1"
import {bytesToHex, hexToBytes} from "@noble/curves/abstract/utils"
import {generateSecretKey, getPublicKey, getEventHash} from "nostr-tools/pure"
import {now} from "@welshman/lib"
import {
  HashedEvent,
  EventTemplate,
  StampedEvent,
  OwnedEvent,
  isStampedEvent,
  isOwnedEvent,
  isHashedEvent,
} from "./Events.js"

export const makeSecret = () => bytesToHex(generateSecretKey())

export const getPubkey = (secret: string) => getPublicKey(hexToBytes(secret))

export const getHash = (event: OwnedEvent) => getEventHash(event)

export const getSig = (event: HashedEvent, secret: string) =>
  bytesToHex(schnorr.sign(event.id, secret))

export const stamp = (event: EventTemplate, created_at = now()) => ({...event, created_at})

export const own = (event: StampedEvent, pubkey: string) => ({...event, pubkey})

export const hash = (event: OwnedEvent) => ({...event, id: getHash(event)})

export const sign = (event: HashedEvent, secret: string) => ({...event, sig: getSig(event, secret)})

export const prep = (event: EventTemplate, pubkey: string, created_at = now()) => {
  if (!isStampedEvent(event as StampedEvent)) {
    event = stamp(event, created_at)
  }

  if (!isOwnedEvent(event as OwnedEvent)) {
    event = own(event as StampedEvent, pubkey)
  }

  if (!isHashedEvent(event as HashedEvent)) {
    event = hash(event as OwnedEvent)
  }

  return event as HashedEvent
}
