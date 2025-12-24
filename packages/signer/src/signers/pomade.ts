import * as nt44 from "nostr-tools/nip44"
import type {Client} from "@pomade/core"
import type {StampedEvent} from "@welshman/util"
import {thrower, hexToBytes} from "@welshman/lib"
import {ISigner, SignOptions, signWithOptions} from "../util.js"

export class PomadeSigner implements ISigner {
  #pubkey: string
  #sharedSecretCache = new Map<string, Uint8Array<ArrayBuffer>>()

  constructor(readonly client: Client) {
    this.#pubkey = client.userPubkey
  }

  private getSharedSecret = async (pubkey: string) => {
    let sharedSecret = this.#sharedSecretCache.get(pubkey)
    if (!sharedSecret) {
      const hexSharedSecret = await this.client.getConversationKey(pubkey)

      if (hexSharedSecret) {
        sharedSecret = hexToBytes(hexSharedSecret)
        this.#sharedSecretCache.set(pubkey, sharedSecret)
      }
    }

    return sharedSecret
  }

  getPubkey = async () => this.#pubkey

  sign = (event: StampedEvent, options: SignOptions = {}) => {
    const promise = this.client.sign(event).then(r => {
      if (!r.event) {
        throw new Error(r.messages[0]?.payload.message || "Failed to sign event")
      }

      return r.event
    })

    return signWithOptions(promise, options)
  }

  nip04 = {
    encrypt: thrower("PomadeSigner does not support nip44"),
    decrypt: thrower("PomadeSigner does not support nip44"),
  }

  nip44 = {
    encrypt: async (pubkey: string, message: string) => {
      const sharedSecret = await this.getSharedSecret(pubkey)

      if (!sharedSecret) {
        throw new Error("Failed to get shared secret")
      }

      return nt44.v2.encrypt(message, sharedSecret)
    },
    decrypt: async (pubkey: string, message: string) => {
      const sharedSecret = await this.getSharedSecret(pubkey)

      if (!sharedSecret) {
        throw new Error("Failed to get shared secret")
      }

      return nt44.v2.decrypt(message, sharedSecret)
    },
  }
}
