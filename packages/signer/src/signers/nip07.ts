import {noop} from "@welshman/lib"
import {StampedEvent, hash, own} from "@welshman/util"
import {signWithOptions, SignOptions, Sign, ISigner, EncryptionImplementation} from "../util.js"

export type Nip07 = {
  signEvent: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPublicKey: () => string | undefined
}

export const getNip07 = () => (window as {nostr?: Nip07}).nostr

export class Nip07Signer implements ISigner {
  #lock = Promise.resolve()

  #then = async <T>(f: (ext: Nip07) => T | Promise<T>) => {
    const promise = this.#lock.then(() => {
      const ext = getNip07()

      if (!ext) throw new Error("Nip07 is not enabled")

      return f(ext)
    })

    // Recover from errors
    this.#lock = promise.then(noop).catch(noop)

    return promise
  }

  getPubkey = async () => this.#then<string>(ext => ext.getPublicKey() as string)

  sign = (template: StampedEvent, options: SignOptions = {}) =>
    signWithOptions(
      this.#then(async ext => ext.signEvent(hash(own(template, await ext.getPublicKey()!)))),
      options,
    )

  nip04 = {
    encrypt: (pubkey: string, message: string) =>
      this.#then(ext => ext.nip04.encrypt(pubkey, message)),
    decrypt: (pubkey: string, message: string) =>
      this.#then(ext => ext.nip04.decrypt(pubkey, message)),
  }

  nip44 = {
    encrypt: (pubkey: string, message: string) =>
      this.#then(ext => ext.nip44.encrypt(pubkey, message)),
    decrypt: (pubkey: string, message: string) =>
      this.#then(ext => ext.nip44.decrypt(pubkey, message)),
  }
}
