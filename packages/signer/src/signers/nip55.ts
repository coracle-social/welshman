import {noop} from "@welshman/lib"
import {SignedEvent, StampedEvent, hash, own, Pubkey} from "@welshman/util"
import {signWithOptions, SignOptions, ISigner} from "../util.js"

export type Nip55AppInfo = {
  name: string
  packageName: string
  iconUrl?: string
}

export type Nip55Crypt = (
  packageName: string,
  text: string,
  id: string,
  pubKey: string,
  npub: string,
) => Promise<{result: string}>

/**
 * The part of nostr-signer-capacitor-plugin's `NostrSignerPlugin` that
 * `Nip55Signer` uses, declared structurally so this package never imports the
 * plugin. It only exists in Capacitor apps, and a bundler can't resolve a
 * package that was never installed.
 */
export type Nip55 = {
  setPackageName: (packageName: string) => Promise<void>
  getInstalledSignerApps: () => Promise<{apps: Nip55AppInfo[]}>
  getPublicKey: (packageName?: string) => Promise<{npub: string}>
  signEvent: (
    packageName: string,
    eventJson: string,
    id: string,
    npub: string,
  ) => Promise<{event: string}>
  nip04Encrypt: Nip55Crypt
  nip04Decrypt: Nip55Crypt
  nip44Encrypt: Nip55Crypt
  nip44Decrypt: Nip55Crypt
}

let plugin: Nip55 | undefined

/**
 * Register the NIP-55 plugin. Capacitor apps should call this once at startup:
 *
 *     import {NostrSignerPlugin} from "nostr-signer-capacitor-plugin"
 *     import {setNip55Plugin} from "@welshman/signer"
 *
 *     setNip55Plugin(NostrSignerPlugin)
 */
export const setNip55Plugin = (nip55: Nip55 | undefined) => {
  plugin = nip55
}

export const getNip55Plugin = () => plugin

/** Installed signer apps, or an empty list if no plugin has been registered. */
export const getNip55 = async (): Promise<Nip55AppInfo[]> => {
  if (!plugin) return []

  const {apps} = await plugin.getInstalledSignerApps()

  return apps
}

const makeRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export class Nip55Signer implements ISigner {
  #pubkey?: string
  #lock: Promise<unknown> = Promise.resolve()
  #setup?: Promise<void>

  constructor(
    readonly packageName: string,
    pubkey?: string,
  ) {
    this.#pubkey = pubkey
  }

  #then = async <T>(f: (plugin: Nip55) => T | Promise<T>): Promise<T> => {
    const promise = this.#lock.then(async () => {
      const nip55 = plugin

      if (!nip55) throw new Error("Nip55 is not enabled")

      if (!this.#setup) {
        this.#setup = nip55.setPackageName(this.packageName)
        this.#setup.catch(() => {
          this.#setup = undefined
        })
      }

      await this.#setup

      return f(nip55)
    })

    // Swallow the result either way — a failed call must not poison the lock
    this.#lock = promise.then(noop, noop)

    return promise
  }

  #crypt = async (
    method: "nip04Encrypt" | "nip04Decrypt" | "nip44Encrypt" | "nip44Decrypt",
    pubkey: string,
    message: string,
  ): Promise<string> => {
    if (!this.#pubkey) {
      await this.getPubkey()
    }

    return this.#then(async plugin => {
      const {result} = await plugin[method](
        this.packageName,
        message,
        makeRequestId(),
        pubkey,
        this.#pubkey!,
      )

      return result
    })
  }

  getPubkey = async (): Promise<string> => {
    return this.#then(async plugin => {
      if (!this.#pubkey) {
        const {npub} = await plugin.getPublicKey(this.packageName)

        this.#pubkey = Pubkey.from(npub).toString()
      }

      return this.#pubkey
    })
  }

  sign = (template: StampedEvent, options: SignOptions = {}): Promise<SignedEvent> =>
    signWithOptions(
      this.getPubkey().then(pubkey => {
        const hashedEvent = hash(own(template, pubkey))

        return this.#then(async plugin => {
          const {event: json} = await plugin.signEvent(
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
    encrypt: (pubkey: string, message: string) => this.#crypt("nip04Encrypt", pubkey, message),
    decrypt: (pubkey: string, message: string) => this.#crypt("nip04Decrypt", pubkey, message),
  }

  nip44 = {
    encrypt: (pubkey: string, message: string) => this.#crypt("nip44Encrypt", pubkey, message),
    decrypt: (pubkey: string, message: string) => this.#crypt("nip44Decrypt", pubkey, message),
  }
}
