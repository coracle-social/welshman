import {NostrSignerPlugin, AppInfo} from "nostr-signer-capacitor-plugin"
import {decode} from "nostr-tools/nip19"
import {SignedEvent, StampedEvent} from "@welshman/util"
import {hash, own, ISigner} from "../util.js"

export const getNip55 = async (): Promise<AppInfo[]> => {
  const {apps} = await NostrSignerPlugin.getInstalledSignerApps()
  return apps
}

export class Nip55Signer implements ISigner {
  #lock = Promise.resolve()
  #plugin = NostrSignerPlugin
  #packageName: string
  #packageNameSet = false
  #npub?: string
  #publicKey?: string

  constructor(packageName: string) {
    this.#packageName = packageName
    this.#initialize()
  }

  #initialize() {
    if (!this.#packageNameSet) {
      void this.#plugin.setPackageName({packageName: this.#packageName}).then(() => {
        this.#packageNameSet = true
      })
    }
  }

  #then = async <T>(f: (signer: typeof NostrSignerPlugin) => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(async () => {
      if (!this.#packageNameSet) {
        try {
          await this.#plugin.setPackageName({packageName: this.#packageName})
          this.#packageNameSet = true
        } catch (error) {
          this.#packageNameSet = false
          throw error
        }
      }
      return f(this.#plugin)
    })

    this.#lock = promise.then(() => Promise.resolve())

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async signer => {
      if (!this.#publicKey || !this.#npub) {
        try {
          const {npub} = await signer.getPublicKey()
          this.#npub = npub
          const {data} = decode(npub)
          this.#publicKey = data as string
        } catch (error) {
          throw new Error("Failed to get public key")
        }
      }
      return this.#publicKey
    })
  }

  sign = async (template: StampedEvent): Promise<SignedEvent> => {
    const pubkey = await this.getPubkey() // hex-encoded public key
    const npub = this.#npub! // Bech32-encoded public key
    const event = {sig: "", ...hash(own(template, pubkey))}

    return this.#then(async signer => {
      const {event: signedEventJson} = await signer.signEvent({
        eventJson: JSON.stringify(event),
        eventId: event.id,
        npub: npub,
      })
      const signedEvent = JSON.parse(signedEventJson) as SignedEvent
      return signedEvent
    })
  }

  nip04 = {
    encrypt: async (recipientPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const {result} = await signer.nip04Encrypt({
          pubKey: recipientPubKey,
          plainText: message,
          npub: this.#npub!,
        })
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const {result} = await signer.nip04Decrypt({
          pubKey: senderPubKey,
          encryptedText: message,
          npub: this.#npub!,
        })
        return result
      })
    },
  }

  nip44 = {
    encrypt: async (recipientPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const {result} = await signer.nip44Encrypt({
          pubKey: recipientPubKey,
          plainText: message,
          npub: this.#npub!,
        })
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const {result} = await signer.nip44Decrypt({
          pubKey: senderPubKey,
          encryptedText: message,
          npub: this.#npub!,
        })
        return result
      })
    },
  }
}
