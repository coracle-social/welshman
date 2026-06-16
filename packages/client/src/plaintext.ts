import {decrypt} from "@welshman/signer"
import type {Maybe} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {ClientData} from "./clientData.js"

/**
 * A cache of decrypted event content, keyed by event id.
 *
 * In the old global model decryption used `getSigner(getSession(event.pubkey))`
 * — whichever logged-in account authored the event. In the per-client model
 * there is exactly one identity, so this reduces to "is this our user?". That
 * scoping is also what keeps decrypted content (including DM rumors) from
 * bleeding across identities — each client decrypts only its own.
 */
export class Plaintext extends ClientData<string> {
  ensure = async (event: TrustedEvent): Promise<Maybe<string>> => {
    // Check for key presence rather than truthiness so a legitimately empty
    // decrypted result ("") is treated as cached and we don't re-hit the signer
    // on every call.
    if (event.content && this.get(event.id) === undefined) {
      const signer = event.pubkey === this.ctx.user?.pubkey ? this.ctx.user?.signer : undefined

      if (!signer) return

      let result

      try {
        result = await decrypt(signer, event.pubkey, event.content)
      } catch (e: any) {
        if (!String(e).match(/invalid base64/)) {
          throw e
        }
      }

      if (result !== undefined) {
        this.set(event.id, result)
      }
    }

    return this.get(event.id)
  }
}
