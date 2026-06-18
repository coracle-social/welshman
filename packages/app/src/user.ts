import type {StampedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {LoggingSigner} from "./logging.js"
import {getSignerFromSession} from "./session.js"
import type {Session} from "./session.js"
import type {IApp} from "./app.js"

/**
 * A single identity: a pubkey plus the signer that proves it. An `App` is
 * centered on (at most) one `User`, since the data a user can access depends
 * entirely on who they are.
 */
export class User {
  constructor(
    readonly pubkey: string,
    readonly signer: ISigner,
  ) {}

  static async fromSigner(signer: ISigner) {
    if (!(signer instanceof LoggingSigner)) {
      signer = new LoggingSigner(signer)
    }

    const pubkey = await signer.getPubkey()

    return new User(pubkey, signer)
  }

  /**
   * Reconstruct a signing user from a persisted session, using the registered
   * session handlers to find the one for the session's method. The signer is
   * wrapped in a `LoggingSigner` (observe it with `makeAppPolicyLogger`) and the
   * pubkey is derived from it. Returns undefined when no handler is registered
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

  sign = (event: StampedEvent) => this.signer.sign(event)

  nip44EncryptToSelf = (payload: string) => this.signer.nip44.encrypt(this.pubkey, payload)
}
