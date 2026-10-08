import {StampedEvent} from "@welshman/util"
import {SignerQueue} from "../queue.js"
import {SignerOptions, Sign, ISigner, EncryptionImplementation} from "../util.js"

export type Nip07 = {
  signEvent: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPublicKey: () => string | undefined
}

export const getNip07 = () => (window as {nostr?: Nip07}).nostr

export class Nip07Signer implements ISigner {
  #queue = new SignerQueue()
  #pubkey?: Promise<string>

  #then = <T>(f: (ext: Nip07) => T | Promise<T>, options: SignerOptions) =>
    this.#queue.push(async () => {
      const ext = getNip07()

      if (!ext) throw new Error("Nip07 is not enabled")

      return f(ext)
    }, options)

  getPubkey = (options: SignerOptions = {}) => {
    if (!this.#pubkey) {
      this.#pubkey = this.#then<string>(ext => ext.getPublicKey() as string, options)
      this.#pubkey.catch(() => {
        this.#pubkey = undefined
      })
    }

    return this.#pubkey
  }

  sign = (template: StampedEvent, options: SignerOptions = {}) =>
    this.#then(ext => ext.signEvent(template), options)

  nip04 = {
    encrypt: (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.#then(ext => ext.nip04.encrypt(pubkey, message), options),
    decrypt: (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.#then(ext => ext.nip04.decrypt(pubkey, message), options),
  }

  nip44 = {
    encrypt: (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.#then(ext => ext.nip44.encrypt(pubkey, message), options),
    decrypt: (pubkey: string, message: string, options: SignerOptions = {}) =>
      this.#then(ext => ext.nip44.decrypt(pubkey, message), options),
  }
}
