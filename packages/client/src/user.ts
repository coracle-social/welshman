import {Maybe} from '@welshman/lib'
import {Repository, AdapterFactory, NetContext, WrapManager, DiffOptions, PullOptions, PushOptions, RequestOptions, PublishOptions, LoaderOptions, Tracker, Pool, push, pull, diff, publish, request, makeLoader} from '@welshman/net'
import {ISigner} from '@welshman/signer'

export type UserOptions = {
  shouldAuth?: (socket: Socket) => boolean
}

export class User {
  constructor(
    readonly pubkey: string,
    readonly signer: ISigner,
    readonly options: UserOptions
  ) {}

  static async fromSigner(signer: ISigner, options: UserOptions) {
    const pubkey = await signer.getPubkey()

    return new User(pubkey, signer, options)
  }

  makeSocketPolicyAuth = () =>
    makeSocketPolicyAuth({
      sign: this.signer.sign,
      shouldAuth: this.options.shouldAuth,
    })
}
