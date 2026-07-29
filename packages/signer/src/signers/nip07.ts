import {noop} from "@welshman/lib"
import {StampedEvent} from "@welshman/util"
import {signWithOptions, SignOptions, Sign, ISigner, EncryptionImplementation} from "../util.js"

export type Nip07 = {
  signEvent: Sign
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation
  getPublicKey: () => string | undefined
}

export const getNip07 = () => (window as {nostr?: Nip07}).nostr

const release = (promise: Promise<unknown>) =>
  new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, 30_000)

    promise.catch(noop).then(() => {
      clearTimeout(timeout)
      resolve()
    })
  })

export class Nip07Signer implements ISigner {
  #lock = Promise.resolve()
  #pubkey?: Promise<string>

  #then = async <T>(f: (ext: Nip07) => T | Promise<T>) => {
    const promise = this.#lock.then(() => {
      const ext = getNip07()

      if (!ext) throw new Error("Nip07 is not enabled")

      return f(ext)
    })

    this.#lock = release(promise)

    return promise
  }

  getPubkey = () => {
    if (!this.#pubkey) {
      this.#pubkey = this.#then<string>(ext => ext.getPublicKey() as string)
      this.#pubkey.catch(() => {
        this.#pubkey = undefined
      })
    }

    return this.#pubkey
  }

  sign = (template: StampedEvent, options: SignOptions = {}) =>
    signWithOptions(
      this.#then(ext => ext.signEvent(template)),
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
