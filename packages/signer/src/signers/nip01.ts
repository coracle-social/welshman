import {EventTemplate} from '@welshman/util'
import {nip04, nip44, own, hash, sign, getPubkey, ISigner, makeSecret} from "../util"

export class Nip01Signer implements ISigner {
  private pubkey: string

  constructor(private secret: string) {
    this.pubkey = getPubkey(this.secret)
  }

  static fromSecret = (secret: string) => new Nip01Signer(secret)

  static ephemeral = () => new Nip01Signer(makeSecret())

  getPubkey = async () => this.pubkey

  sign = async (event: EventTemplate) => sign(hash(own(this.pubkey, event)), this.secret)

  nip04 = {
    encrypt: async (pubkey: string, message: string) =>
      nip04.encrypt(pubkey, this.secret, message),
    decrypt: async (pubkey: string, message: string) =>
      nip04.decrypt(pubkey, this.secret, message),
  }

  nip44 = {
    encrypt: async (pubkey: string, message: string) =>
      nip44.encrypt(pubkey, this.secret, message),
    decrypt: async (pubkey: string, message: string) =>
      nip44.decrypt(pubkey, this.secret, message),
  }
}
