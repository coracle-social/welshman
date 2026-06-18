import {decrypt} from "@welshman/signer"
import type {Maybe} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {MapPlugin} from "./base.js"

/**
 * A cache of decrypted event content, keyed by event id.
 */
export class Plaintext extends MapPlugin<string> {
  ensure = async (event: TrustedEvent): Promise<Maybe<string>> => {
    if (this.ctx.user?.pubkey !== event.pubkey) return

    let result = this.get(event.id)
    if (event.content && result === undefined) {
      try {
       result = await decrypt(this.ctx.user.signer, event.pubkey, event.content)
       this.set(event.id, result)
      } catch (e: any) {
        if (!String(e).match(/invalid base64/)) {
          throw e
        }
      }
    }

    return result
  }
}
