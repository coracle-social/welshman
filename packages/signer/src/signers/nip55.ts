import {SignedEvent, StampedEvent} from '@welshman/util'
import {hash, own, ISigner} from '../util'
import {NostrSignerPlugin} from 'nostr-signer-capacitor-plugin'


export const getNip55 = () => NostrSignerPlugin

export class Nip55Signer implements ISigner {
  #lock = Promise.resolve()

  #then = async <T>(f: (signer: NostrSignerPlugin) => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(() => f(getNip55()))

    // Recover from errors
    this.#lock = promise.then(() => undefined, () => undefined)

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async (signer) => {
      const {npub} = await signer.getPublicKey()
      return npub
    })
  }

  sign = async (template: StampedEvent): Promise<SignedEvent> => {
    const pubkey = await this.getPubkey()
    const event = hash(own(template, pubkey))

    return this.#then(async (signer) => {
      const {event: signedEventJson} = await signer.signEvent({
        eventJson: JSON.stringify(event),
      })
      const signedEvent = JSON.parse(signedEventJson) as SignedEvent
      return signedEvent
    })
  }

  nip04 = {
    encrypt: (pubkey: string, message: string): Promise<string> =>
      this.#then(async (signer) => {
        const {result} = await signer.nip04Encrypt({
          pubKey: pubkey,
          plainText: message,
        })
        return result
      }),
    decrypt: (pubkey: string, message: string): Promise<string> =>
      this.#then(async (signer) => {
        const {result} = await signer.nip04Decrypt({
          pubKey: pubkey,
          encryptedText: message,
        })
        return result
      }),
  }

  nip44 = {
    encrypt: (pubkey: string, message: string): Promise<string> =>
      this.#then(async (signer) => {
        const {result} = await signer.nip44Encrypt({
          pubKey: pubkey,
          plainText: message,
        })
        return result
      }),
    decrypt: (pubkey: string, message: string): Promise<string> =>
      this.#then(async (signer) => {
        const {result} = await signer.nip44Decrypt({
          pubKey: pubkey,
          encryptedText: message,
        })
        return result
      }),
  }
}
