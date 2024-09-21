import {StampedEvent} from '@welshman/util'
import {hash, own, Sign, ISigner, EncryptionImplementation} from '../util'
import NostrSigner from 'nostr-signer-capacitor-plugin'


export type Nip55 = {
  signEvent: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPublicKey: () => string | undefined
}

export const getNip55 = () => (window as {nostr?: Nip55}).nostr

export class Nip55Signer implements ISigner {
  #lock = Promise.resolve()

  #then = async <T>(f: (ext: Nip55) => T | Promise<T>) => {
    const promise = this.#lock.then(() => {
      const ext = getNip55()

      if (!ext) throw new Error("Nip55 is not enabled")

      return f(ext)
    })

    // Recover from errors
    this.#lock = promise.then(() => undefined, () => undefined)

    return promise
  }

  getPubkey = async () => NostrSigner.getPublicKey()!

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

