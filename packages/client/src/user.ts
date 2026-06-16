import type {StampedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

/**
 * A single identity: a pubkey plus the signer that proves it. A `Client` is
 * centered on (at most) one `User`, since the data a user can access depends
 * entirely on who they are.
 */
export class User {
  constructor(
    readonly pubkey: string,
    readonly signer: ISigner,
  ) {}

  static async fromSigner(signer: ISigner) {
    const pubkey = await signer.getPubkey()

    return new User(pubkey, signer)
  }

  sign = (event: StampedEvent) => this.signer.sign(event)

  nip44EncryptToSelf = (payload: string) => this.signer.nip44.encrypt(this.pubkey, payload)
}
