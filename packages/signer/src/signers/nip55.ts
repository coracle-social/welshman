import {randomId as random_id} from "@welshman/lib"
import {SignedEvent, StampedEvent, hash, own} from "@welshman/util"
import * as nip19 from "nostr-tools/nip19"
import {ISigner, SignOptions, signWithOptions} from "../util.js"

export type Nip55AppInfo = {
  name: string
  packageName: string
  iconUrl?: string
}

type Nip55Plugin = {
  setPackageName: (package_name: string) => Promise<void>
  getInstalledSignerApps: () => Promise<{apps: Nip55AppInfo[]}>
  getPublicKey: (
    package_name?: string,
    permissions?: string,
  ) => Promise<{
    npub: string
    package: string
  }>
  signEvent: (
    package_name: string,
    event_json: string,
    id: string,
    npub: string,
  ) => Promise<{
    signature: string
    id: string
    event: string
  }>
  nip04Encrypt: (
    package_name: string,
    plain_text: string,
    id: string,
    pub_key: string,
    npub: string,
  ) => Promise<{
    result: string
    id: string
  }>
  nip04Decrypt: (
    package_name: string,
    encrypted_text: string,
    id: string,
    pub_key: string,
    npub: string,
  ) => Promise<{
    result: string
    id: string
  }>
  nip44Encrypt: (
    package_name: string,
    plain_text: string,
    id: string,
    pub_key: string,
    npub: string,
  ) => Promise<{
    result: string
    id: string
  }>
  nip44Decrypt: (
    package_name: string,
    encrypted_text: string,
    id: string,
    pub_key: string,
    npub: string,
  ) => Promise<{
    result: string
    id: string
  }>
}

type Nip55PluginModule = {
  NostrSignerPlugin: Nip55Plugin
}

let nip55_plugin: Nip55Plugin | undefined

const load_nip55_plugin = async (): Promise<Nip55Plugin> => {
  if (nip55_plugin) return nip55_plugin
  try {
    const plugin_module = (await import("nostr-signer-capacitor-plugin")) as Nip55PluginModule
    nip55_plugin = plugin_module.NostrSignerPlugin
    return nip55_plugin
  } catch {
    throw new Error("nostr-signer-capacitor-plugin is required for Nip55Signer")
  }
}

export const getNip55 = async (): Promise<Nip55AppInfo[]> => {
  const signer_plugin = await load_nip55_plugin()
  const {apps} = await signer_plugin.getInstalledSignerApps()
  return apps
}

export class Nip55Signer implements ISigner {
  #lock = Promise.resolve()
  #packageName: string
  #packageNameSet = false
  #npub?: string
  #publicKey?: string

  constructor(packageName: string, publicKey?: string) {
    this.#packageName = packageName

    if (publicKey) {
      this.#publicKey = publicKey
      this.#npub = nip19.npubEncode(publicKey)
    }

    this.#initialize()
  }

  #initialize() {
    if (!this.#packageNameSet) {
      void this.#then(async () => undefined)
    }
  }

  #then = async <T>(f: (signer: Nip55Plugin) => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(async () => {
      const signer_plugin = await load_nip55_plugin()
      if (!this.#packageNameSet) {
        try {
          await signer_plugin.setPackageName(this.#packageName)
          this.#packageNameSet = true
        } catch (error) {
          this.#packageNameSet = false
          throw error
        }
      }
      return f(signer_plugin)
    })

    this.#lock = promise.then(() => Promise.resolve())

    return promise
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async signer => {
      if (!this.#publicKey || !this.#npub) {
        try {
          const {npub} = await signer.getPublicKey(this.#packageName)
          const {data} = nip19.decode(npub)

          this.#npub = npub
          this.#publicKey = data as string
        } catch (error) {
          throw new Error("Failed to get public key")
        }
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
            this.#packageName,
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
        const request_id = random_id()
        const {result} = await signer.nip04Encrypt(
          this.#packageName,
          message,
          request_id,
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
        const request_id = random_id()
        const {result} = await signer.nip04Decrypt(
          this.#packageName,
          message,
          request_id,
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
        const request_id = random_id()
        const {result} = await signer.nip44Encrypt(
          this.#packageName,
          message,
          request_id,
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
        const request_id = random_id()
        const {result} = await signer.nip44Decrypt(
          this.#packageName,
          message,
          request_id,
          senderPubKey,
          this.#npub!,
        )
        return result
      })
    },
  }
}
