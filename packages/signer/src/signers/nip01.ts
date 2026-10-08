import {StampedEvent, own, hash, sign, getPubkey, makeSecret} from "@welshman/util"
import {nip04, nip44, ISigner} from "../util.js"

/**
 * A local key, so every request is answered synchronously. Nothing here can hang or be
 * worth reordering, which is why it takes no `SignerOptions`.
 */
export class Nip01Signer implements ISigner {
  #pubkey: string

  constructor(private secret: string) {
    this.#pubkey = getPubkey(this.secret)
  }

  static fromSecret = (secret: string) => new Nip01Signer(secret)

  static ephemeral = () => new Nip01Signer(makeSecret())

  getPubkey = async () => this.#pubkey

  sign = async (event: StampedEvent) => sign(hash(own(event, this.#pubkey)), this.secret)

  nip04 = {
    encrypt: async (pubkey: string, message: string) => nip04.encrypt(pubkey, this.secret, message),
    decrypt: async (pubkey: string, message: string) => nip04.decrypt(pubkey, this.secret, message),
  }

  nip44 = {
    encrypt: async (pubkey: string, message: string) => nip44.encrypt(pubkey, this.secret, message),
    decrypt: async (pubkey: string, message: string) => nip44.decrypt(pubkey, this.secret, message),
  }
}
