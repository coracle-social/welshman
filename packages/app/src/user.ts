import type {StampedEvent} from "@welshman/util"
import {WrappedSigner} from "@welshman/signer"
import type {ISigner, SignOptions, SignerMethodWrapper} from "@welshman/signer"
import {getSignerFromSession} from "./session.js"
import type {Session} from "./session.js"
import type {IApp} from "./app.js"

/**
 * A single identity: a pubkey plus the signer that proves it. An `App` is
 * centered on (at most) one `User`, since the data a user can access depends
 * entirely on who they are.
 *
 * `signer` is mutable so app policies can layer behavior onto it after
 * construction via `wrapSigner` — e.g. `appPolicyCacheDecrypt` and
 * `appPolicyLogSignerMethods`.
 */
export class User {
  constructor(
    readonly pubkey: string,
    public signer: ISigner,
  ) {}

  static async fromSigner(signer: ISigner) {
    const pubkey = await signer.getPubkey()

    return new User(pubkey, signer)
  }

  /**
   * Reconstruct a signing user from a persisted session, using the registered
   * session handlers to find the one for the session's method. The pubkey is
   * derived from the signer. Returns undefined when no handler is registered
   * for the session's method.
   */
  static async fromSession(session: Session): Promise<User | undefined> {
    const signer = await getSignerFromSession(session)

    return signer ? User.fromSigner(signer) : undefined
  }

  /**
   * Return the app's signed-in user, throwing if there isn't one — the entry
   * point for actions that can only run as a user (publishing, signing).
   */
  static require(app: IApp): User {
    if (!app.user) {
      throw new Error("This action requires a signed-in user")
    }

    return app.user
  }

  sign = (event: StampedEvent, options?: SignOptions) => this.signer.sign(event, options)

  nip44EncryptToSelf = (payload: string) => this.signer.nip44.encrypt(this.pubkey, payload)

  wrapSigner = (wrap: SignerMethodWrapper) => {
    const original = this.signer

    this.signer = new WrappedSigner(original, wrap)

    return () => {
      this.signer = original
    }
  }
}
