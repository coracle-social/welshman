import {SignedEvent, StampedEvent} from '@welshman/util'
import {hash, own, ISigner} from '../util'
import NostrSigner from 'nostr-signer-capacitor-plugin'

// Define the interface for the NostrSigner methods
export type NostrSignerType = {
  getPublicKey: () => Promise<{ npub: string }>;
  signEvent: (options: { eventJson: string }) => Promise<{ event: string }>;
  nip04Encrypt: (options: { pubKey: string; plainText: string }) => Promise<{ result: string }>;
  nip04Decrypt: (options: { pubKey: string; encryptedText: string }) => Promise<{ result: string }>;
  nip44Encrypt: (options: { pubKey: string; plainText: string }) => Promise<{ result: string }>;
  nip44Decrypt: (options: { pubKey: string; encryptedText: string }) => Promise<{ result: string }>;
}

export const getNostrSigner = () => NostrSigner

export class Nip55Signer implements ISigner {
  private lock = Promise.resolve()

  private then = async <T>(f: (signer: NostrSignerType) => T | Promise<T>): Promise<T> => {
    const promise = this.lock.then(() => f(getNostrSigner()))

    // Recover from errors
    this.lock = promise.then(() => undefined, () => undefined)

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.then(async (signer) => {
      const {npub} = await signer.getPublicKey()
      return npub
    })
  }

  sign = async (template: StampedEvent): Promise<SignedEvent> => {
    const pubkey = await this.getPubkey()
    const event = hash(own(template, pubkey))

    return this.then(async (signer) => {
      const {event: signedEventJson} = await signer.signEvent({
        eventJson: JSON.stringify(event),
      })
      const signedEvent = JSON.parse(signedEventJson) as SignedEvent
      return signedEvent
    })
  }

  nip04 = {
    encrypt: (pubkey: string, message: string): Promise<string> =>
      this.then(async (signer) => {
        const {result} = await signer.nip04Encrypt({
          pubKey: pubkey,
          plainText: message,
        })
        return result
      }),
    decrypt: (pubkey: string, message: string): Promise<string> =>
      this.then(async (signer) => {
        const {result} = await signer.nip04Decrypt({
          pubKey: pubkey,
          encryptedText: message,
        })
        return result
      }),
  }

  nip44 = {
    encrypt: (pubkey: string, message: string): Promise<string> =>
      this.then(async (signer) => {
        const {result} = await signer.nip44Encrypt({
          pubKey: pubkey,
          plainText: message,
        })
        return result
      }),
    decrypt: (pubkey: string, message: string): Promise<string> =>
      this.then(async (signer) => {
        const {result} = await signer.nip44Decrypt({
          pubKey: pubkey,
          encryptedText: message,
        })
        return result
      }),
  }
}
