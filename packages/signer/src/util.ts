import {schnorr} from "@noble/curves/secp256k1"
import {bytesToHex, hexToBytes} from "@noble/hashes/utils"
import * as nt04 from "nostr-tools/nip04"
import * as nt44 from "nostr-tools/nip44"
import {generateSecretKey, getPublicKey, getEventHash} from "nostr-tools/pure"
import {Emitter, cached, now} from "@welshman/lib"
import {SignedEvent, HashedEvent, EventTemplate, StampedEvent, OwnedEvent} from "@welshman/util"

export const makeSecret = () => bytesToHex(generateSecretKey())

export const getPubkey = (secret: string) => getPublicKey(hexToBytes(secret))

export const getHash = (event: OwnedEvent) => getEventHash(event)

export const getSig = (event: HashedEvent, secret: string) =>
  bytesToHex(schnorr.sign(event.id, secret))

export const stamp = (event: EventTemplate, created_at = now()) => ({...event, created_at})

export const own = (event: StampedEvent, pubkey: string) => ({...event, pubkey})

export const hash = (event: OwnedEvent) => ({...event, id: getHash(event)})

export const sign = (event: HashedEvent, secret: string) => ({...event, sig: getSig(event, secret)})

export const nip04 = {
  detect: (m: string) => m.includes("?iv="),
  encrypt: (pubkey: string, secret: string, m: string) => nt04.encrypt(secret, pubkey, m),
  decrypt: (pubkey: string, secret: string, m: string) => nt04.decrypt(secret, pubkey, m),
}

export const nip44 = {
  getSharedSecret: cached({
    maxSize: 10000,
    getKey: ([secret, pubkey]) => `${secret}:${pubkey}`,
    getValue: ([secret, pubkey]: string[]) =>
      nt44.v2.utils.getConversationKey(hexToBytes(secret), pubkey),
  }),
  encrypt: (pubkey: string, secret: string, m: string) =>
    nt44.v2.encrypt(m, nip44.getSharedSecret(secret, pubkey)!),
  decrypt: (pubkey: string, secret: string, m: string) =>
    nt44.v2.decrypt(m, nip44.getSharedSecret(secret, pubkey)!),
}

export type Sign = (event: StampedEvent) => Promise<SignedEvent>

export type SignOptions = {
  signal?: AbortSignal
}

export type SignWithOptions = (event: StampedEvent, options?: SignOptions) => Promise<SignedEvent>

export type Encrypt = (pubkey: string, message: string) => Promise<string>

export type Decrypt = (pubkey: string, message: string) => Promise<string>

export type EncryptionImplementation = {
  encrypt: Encrypt
  decrypt: Decrypt
}

export interface ISigner {
  sign: SignWithOptions
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPubkey: () => Promise<string>
}

export const decrypt = async (signer: ISigner, pubkey: string, message: string) =>
  nip04.detect(message)
    ? signer.nip04.decrypt(pubkey, message)
    : signer.nip44.decrypt(pubkey, message)

export type SignerMethodWrapper = <T>(method: string, thunk: () => Promise<T>) => Promise<T>

export class WrappedSigner extends Emitter implements ISigner {
  constructor(
    readonly signer: ISigner,
    readonly wrapMethod: SignerMethodWrapper,
  ) {
    super()
  }

  sign(event: StampedEvent, options: SignOptions = {}) {
    return this.wrapMethod("sign", () => this.signer.sign(event, options))
  }

  getPubkey() {
    return this.wrapMethod("getPubkey", () => this.signer.getPubkey())
  }

  nip04 = {
    encrypt: async (pubkey: string, message: string) =>
      this.wrapMethod("nip04.encrypt", () => this.signer.nip04.encrypt(pubkey, message)),
    decrypt: async (pubkey: string, message: string) =>
      this.wrapMethod("nip04.decrypt", () => this.signer.nip04.decrypt(pubkey, message)),
  }

  nip44 = {
    encrypt: async (pubkey: string, message: string) =>
      this.wrapMethod("nip44.encrypt", () => this.signer.nip44.encrypt(pubkey, message)),
    decrypt: async (pubkey: string, message: string) =>
      this.wrapMethod("nip44.decrypt", () => this.signer.nip44.decrypt(pubkey, message)),
  }
}

export const signWithOptions = (
  promise: Promise<SignedEvent> | SignedEvent,
  options: SignOptions,
) =>
  new Promise<SignedEvent>((resolve, reject) => {
    Promise.resolve(promise).then(resolve).catch(reject)
    options.signal?.addEventListener("abort", () => reject("Signing was aborted"))
  })
