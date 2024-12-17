import {StampedEvent} from "@welshman/util"
import {hash, own, Sign, ISigner, EncryptionImplementation} from "../util.js"

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
    this.#lock = promise.then(
      () => undefined,
      () => undefined,
    )

    return promise
  }

  getPubkey = async () => getNip07()!.getPublicKey()!

  sign = async (template: StampedEvent) => {
    const event = hash(own(template, await this.getPubkey()))

    return this.#then(ext => ext.signEvent(event))
  }

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
