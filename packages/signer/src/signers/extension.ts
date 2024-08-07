import {EventTemplate} from '@welshman/util'
import {hash, own, Sign, ISigner, EncryptionImplementation} from '../util'

export type Extension = {
  sign: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPublicKey: () => string | undefined
}

export class ExtensionSigner implements ISigner {
  #lock = Promise.resolve()

  #ext = () => (window as {nostr?: Extension}).nostr

  #then = async <T>(f: (ext: Extension) => T | Promise<T>) => {
    const promise = this.#lock.then(() => {
      const ext = this.#ext()

      if (!ext) throw new Error("Extension is not enabled")

      return f(ext)
    })

    // Recover from errors
    this.#lock = promise.then(() => undefined, () => undefined)

    return promise
  }

  isEnabled = () => Boolean(this.#ext())

  getPubkey = () =>
    this.#then(ext => {
      const pubkey = ext.getPublicKey()

      if (!pubkey) throw new Error("Failed to retrieve pubkey")

      return pubkey as string
    })

  sign = (event: EventTemplate) =>
    this.#then(ext => ext.sign(hash(own(ext.getPublicKey() as string, event))))

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

