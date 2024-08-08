import {schnorr} from '@noble/curves/secp256k1'
import {bytesToHex, hexToBytes} from '@noble/hashes/utils'
import {nip04 as nt04, nip44 as nt44, generateSecretKey, getPublicKey, getEventHash} from "nostr-tools"
import {cached} from '@welshman/lib'
import {SignedEvent, HashedEvent, EventTemplate, OwnedEvent} from '@welshman/util'

export const makeSecret = () => bytesToHex(generateSecretKey())

export const getPubkey = (secret: string) => getPublicKey(hexToBytes(secret))

export const getHash = (event: OwnedEvent) => getEventHash(event)

export const getSig = (event: HashedEvent, secret: string) =>
  bytesToHex(schnorr.sign(event.id, secret))

export const own = (pubkey: string, event: EventTemplate) => ({...event, pubkey})

export const hash = (event: OwnedEvent): HashedEvent => ({...event, id: getHash(event)})

export const sign = (event: HashedEvent, secret: string) => ({...event, sig: getSig(event, secret)})

export const nip04 = {
  detect: (m: string) => m.includes("?iv="),
  encrypt: (pubkey: string, secret: string, m: string) => nt04.encrypt(secret, pubkey, m),
  decrypt: (pubkey: string, secret: string, m: string) =>  nt04.decrypt(secret, pubkey, m),
}

export const nip44 = {
  getSharedSecret: cached({
    maxSize: 10000,
    getKey: ([secret, pubkey]) => [secret, pubkey].join(":"),
    getValue: ([secret, pubkey]: string[]) => nt44.v2.utils.getConversationKey(hexToBytes(secret), pubkey),
  }),
  encrypt: (pubkey: string, secret: string, m: string) => nt44.v2.encrypt(m, nip44.getSharedSecret(secret, pubkey)),
  decrypt: (pubkey: string, secret: string, m: string) => nt44.v2.decrypt(m, nip44.getSharedSecret(secret, pubkey)),
}

export type Sign = (event: EventTemplate) => Promise<SignedEvent>

export type Encrypt = (pubkey: string, message: string) => Promise<string>

export type Decrypt = (pubkey: string, message: string) => Promise<string>

export type EncryptionImplementation = {
  encrypt: Encrypt
  decrypt: Decrypt
}

export interface ISigner {
  sign: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPubkey: () => Promise<string>
}

export const decrypt = async (signer: ISigner, pubkey: string, message: string) =>
  nip04.detect(message)
    ? signer.nip04.decrypt(pubkey, message)
    : signer.nip44.decrypt(pubkey, message)
