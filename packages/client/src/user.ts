import {makeSocketPolicyAuth} from "@welshman/net"
import type {Socket} from "@welshman/net"
import type {StampedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"

export type UserOptions = {
  shouldAuth?: (socket: Socket) => boolean
}

/**
 * A single identity: a pubkey plus the signer that proves it. A `Client` is
 * centered on (at most) one `User`, since the data a user can access depends
 * entirely on who they are.
 */
export class User {
  constructor(
    readonly pubkey: string,
    readonly signer: ISigner,
    readonly options: UserOptions = {},
  ) {}

  static async fromSigner(signer: ISigner, options: UserOptions = {}) {
    const pubkey = await signer.getPubkey()

    return new User(pubkey, signer, options)
  }

  makeSocketPolicyAuth = () =>
    makeSocketPolicyAuth({
      sign: this.signer.sign,
      shouldAuth: this.options.shouldAuth,
    })

  sign = (event: StampedEvent) => this.signer.sign(event)

  nip44EncryptToSelf = (payload: string) => this.signer.nip44.encrypt(this.pubkey, payload)
}
