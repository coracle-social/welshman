import {EventTemplate} from '@welshman/util'
import {nip04, nip44, own, hash, sign, getPubkey, ISigner} from "../util"

export class SecretSigner implements ISigner {
  private pubkey: string

  constructor(private secret: string) {
    this.pubkey = getPubkey(this.secret)
  }

  isEnabled = () => true

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
