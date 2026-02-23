import {NostrSignerPlugin, AppInfo} from "nostr-signer-capacitor-plugin"
import * as nip19 from "nostr-tools/nip19"
import {SignedEvent, StampedEvent, hash, own} from "@welshman/util"
import {signWithOptions, SignOptions, ISigner} from "../util.js"

export const getNip55 = async (): Promise<AppInfo[]> => {
  const {apps} = await NostrSignerPlugin.getInstalledSignerApps()
  return apps
}

export class Nip55Signer implements ISigner {
  #lock = Promise.resolve()
  #plugin = NostrSignerPlugin
  #npub?: string
  #publicKey?: string

  constructor(
    readonly packageName: string,
    publicKey?: string,
  ) {
    if (publicKey) {
      this.#publicKey = publicKey
      this.#npub = nip19.npubEncode(publicKey)
    }
  }

  #then = async <T>(f: (signer: typeof NostrSignerPlugin) => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(() => f(this.#plugin))

    this.#lock = promise.then(() => Promise.resolve())

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async signer => {
      if (!this.#publicKey || !this.#npub) {
        const {npub} = await signer.getPublicKey(this.packageName)
        const {data} = nip19.decode(npub)

        this.#npub = npub
        this.#publicKey = data as string
      }
      return this.#publicKey
    })
  }

  sign = (template: StampedEvent, options: SignOptions = {}): Promise<SignedEvent> =>
    signWithOptions(
      this.getPubkey().then(pubkey => {
        const hashedEvent = hash(own(template, pubkey))

        return this.#then(async signer => {
          const {event: json} = await signer.signEvent(
            this.packageName,
            JSON.stringify({sig: "", ...hashedEvent}),
            hashedEvent.id,
            this.#npub!,
          )

          return JSON.parse(json) as SignedEvent
        })
      }),
      options,
    )

  nip04 = {
    encrypt: async (recipientPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await signer.nip04Encrypt(
          this.packageName,
          message,
          id,
          recipientPubKey,
          this.#npub!,
        )
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await signer.nip04Decrypt(
          this.packageName,
          message,
          id,
          senderPubKey,
          this.#npub!,
        )
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
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await signer.nip44Encrypt(
          this.packageName,
          message,
          id,
          recipientPubKey,
          this.#npub!,
        )
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myNpub = this.#npub
      if (!myNpub) {
        await this.getPubkey()
      }
      return this.#then(async signer => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await signer.nip44Decrypt(
          this.packageName,
          message,
          id,
          senderPubKey,
          this.#npub!,
        )
        return result
      })
    },
  }
}
