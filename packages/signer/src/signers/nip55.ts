import {NostrSignerPlugin, AppInfo} from "nostr-signer-capacitor-plugin"
import {SignedEvent, StampedEvent, hash, own, Pubkey} from "@welshman/util"
import {signWithOptions, SignOptions, ISigner} from "../util.js"

export const getNip55 = async (): Promise<AppInfo[]> => {
  const {apps} = await NostrSignerPlugin.getInstalledSignerApps()
  return apps
}

export class Nip55Signer implements ISigner {
  #pubkey?: string
  #lock: Promise<unknown>

  constructor(
    readonly packageName: string,
    pubkey?: string,
  ) {
    this.#pubkey = pubkey
    this.#lock = NostrSignerPlugin.setPackageName(packageName)
  }

  #then = async <T>(f: () => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(f)

    this.#lock = promise.then(() => Promise.resolve())

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async () => {
      if (!this.#pubkey) {
        const {npub} = await NostrSignerPlugin.getPublicKey(this.packageName)

        this.#pubkey = Pubkey.from(npub).toString()
      }

      return this.#pubkey
    })
  }

  sign = (template: StampedEvent, options: SignOptions = {}): Promise<SignedEvent> =>
    signWithOptions(
      this.getPubkey().then(pubkey => {
        const hashedEvent = hash(own(template, pubkey))

        return this.#then(async () => {
          const {event: json} = await NostrSignerPlugin.signEvent(
            this.packageName,
            JSON.stringify({sig: "", ...hashedEvent}),
            hashedEvent.id,
            this.#pubkey!,
          )

          return JSON.parse(json) as SignedEvent
        })
      }),
      options,
    )

  nip04 = {
    encrypt: async (recipientPubKey: string, message: string): Promise<string> => {
      const myPubkey = this.#pubkey
      if (!myPubkey) {
        await this.getPubkey()
      }
      return this.#then(async () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await NostrSignerPlugin.nip04Encrypt(
          this.packageName,
          message,
          id,
          recipientPubKey,
          this.#pubkey!,
        )
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myPubkey = this.#pubkey
      if (!myPubkey) {
        await this.getPubkey()
      }
      return this.#then(async () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await NostrSignerPlugin.nip04Decrypt(
          this.packageName,
          message,
          id,
          senderPubKey,
          this.#pubkey!,
        )
        return result
      })
    },
  }

  nip44 = {
    encrypt: async (recipientPubKey: string, message: string): Promise<string> => {
      const myPubkey = this.#pubkey
      if (!myPubkey) {
        await this.getPubkey()
      }
      return this.#then(async () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await NostrSignerPlugin.nip44Encrypt(
          this.packageName,
          message,
          id,
          recipientPubKey,
          this.#pubkey!,
        )
        return result
      })
    },
    decrypt: async (senderPubKey: string, message: string): Promise<string> => {
      const myPubkey = this.#pubkey
      if (!myPubkey) {
        await this.getPubkey()
      }
      return this.#then(async () => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const {result} = await NostrSignerPlugin.nip44Decrypt(
          this.packageName,
          message,
          id,
          senderPubKey,
          this.#pubkey!,
        )
        return result
      })
    },
  }
}
