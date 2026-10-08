import {hexToBytes} from "@noble/hashes/utils.js"
import * as nt04 from "nostr-tools/nip04"
import * as nt44 from "nostr-tools/nip44"
import {Emitter, cached, defer, noop} from "@welshman/lib"
import {SignedEvent, StampedEvent} from "@welshman/util"

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

export type SignerOptions = {
  signal?: AbortSignal
  /** Requests to one signer are answered highest first, 0 by default, so bulk work behind the
   * user can ask for a negative one and leave the user's own requests ahead of it. */
  priority?: number
}

export type Sign = (event: StampedEvent, options?: SignerOptions) => Promise<SignedEvent>

export type Encrypt = (pubkey: string, message: string, options?: SignerOptions) => Promise<string>

export type Decrypt = (pubkey: string, message: string, options?: SignerOptions) => Promise<string>

export type EncryptionImplementation = {
  encrypt: Encrypt
  decrypt: Decrypt
}

export interface ISigner {
  sign: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPubkey: (options?: SignerOptions) => Promise<string>
  cleanup?: () => Promise<void>
}

export const decrypt = async (
  signer: ISigner,
  pubkey: string,
  message: string,
  options?: SignerOptions,
) =>
  nip04.detect(message)
    ? signer.nip04.decrypt(pubkey, message, options)
    : signer.nip44.decrypt(pubkey, message, options)

// `args` carries the wrapped method's arguments (e.g. [pubkey, message] for
// encrypt/decrypt), so wrappers can key off them — a decrypt cache, say. A
// wrapper that ignores them can take just (method, thunk).
export type SignerMethodWrapper = <T>(
  method: string,
  thunk: () => Promise<T>,
  args: unknown[],
) => Promise<T>

export class WrappedSigner extends Emitter implements ISigner {
  constructor(
    readonly signer: ISigner,
    readonly wrapMethod: SignerMethodWrapper,
  ) {
    super()
  }

  sign = (event: StampedEvent, options: SignerOptions = {}) =>
    this.wrapMethod("sign", () => this.signer.sign(event, options), [event, options])

  getPubkey = (options: SignerOptions = {}) =>
    this.wrapMethod("getPubkey", () => this.signer.getPubkey(options), [options])

  nip04 = {
    encrypt: async (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.wrapMethod("nip04.encrypt", () => this.signer.nip04.encrypt(pubkey, message, options), [
        pubkey,
        message,
        options,
      ]),
    decrypt: async (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.wrapMethod("nip04.decrypt", () => this.signer.nip04.decrypt(pubkey, message, options), [
        pubkey,
        message,
        options,
      ]),
  }

  nip44 = {
    encrypt: async (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.wrapMethod("nip44.encrypt", () => this.signer.nip44.encrypt(pubkey, message, options), [
        pubkey,
        message,
        options,
      ]),
    decrypt: async (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.wrapMethod("nip44.decrypt", () => this.signer.nip44.decrypt(pubkey, message, options), [
        pubkey,
        message,
        options,
      ]),
  }

  async cleanup() {
    await this.signer.cleanup?.()
  }
}

// A signer that never answers would otherwise hold its caller open forever
export const SIGNER_TIMEOUT = 30_000

/**
 * How long welshman waits for one request to a signer, rather than how long that request
 * runs — an extension, a native app and a bunker all answer when they answer, and offer
 * no way to recall a request. The caller's `AbortSignal` and `SIGNER_TIMEOUT` each give up
 * on it, so the signer may still answer afterwards with nobody listening.
 */
export const signerCall = <T>(call: Promise<T>, {signal}: SignerOptions = {}) => {
  const result = defer<T, Error>()
  const abort = () => result.reject(new Error("Signer request was aborted"))
  const timer = setTimeout(
    () => result.reject(new Error("Signer request timed out")),
    SIGNER_TIMEOUT,
  )

  if (signal?.aborted) abort()

  signal?.addEventListener("abort", abort)
  call.then(result.resolve, result.reject)

  result.then(noop, noop).then(() => {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  })

  return result as Promise<T>
}
