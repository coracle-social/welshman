import type {SignerOptions} from "@welshman/signer"
import {MapPlugin} from "./base.js"

type Decryption = {
  promise: Promise<string>
  options: SignerOptions
}

const priorityOf = (options: SignerOptions) => options.priority ?? 0

/**
 * A cache of decrypted content, keyed by the ciphertext. Decryption itself is
 * supplied by the caller (the signer's underlying decrypt), so the cache stays
 * independent of which signer produced the plaintext — and `appPolicyCacheDecrypt`
 * can layer it onto `user.signer` without recursing back into the wrapped signer.
 *
 * A caller shares a decryption of its ciphertext already asked for at least as urgently,
 * so concurrent callers prompt the signer once. The decryption's outcome is the
 * ciphertext's, except an abort, which is the outcome of the caller that asked for it.
 */
export class Plaintext extends MapPlugin<string> {
  private pending = new Map<string, Decryption>()

  ensure = async (
    ciphertext: string,
    decrypt: () => Promise<string>,
    options: SignerOptions = {},
  ): Promise<string> => {
    let result = this.get(ciphertext)

    if (result === undefined) {
      result = await this.decryptOnce(ciphertext, decrypt, options)
    }

    return result
  }

  private decryptOnce = (
    ciphertext: string,
    decrypt: () => Promise<string>,
    options: SignerOptions,
  ): Promise<string> => {
    const shared = this.pending.get(ciphertext)
    let promise: Promise<string>

    if (shared && priorityOf(shared.options) >= priorityOf(options)) {
      // A caller left behind by another's abort asks for the plaintext itself
      promise = shared.promise.catch(error => {
        if (!shared.options.signal?.aborted) throw error

        return this.ensure(ciphertext, decrypt, options)
      })
    } else {
      promise = this.start(ciphertext, decrypt, options)
    }

    return promise
  }

  private start = (ciphertext: string, decrypt: () => Promise<string>, options: SignerOptions) => {
    const promise = decrypt().then(plaintext => {
      this.set(ciphertext, plaintext)

      return plaintext
    })

    const decryption = {promise, options}

    // A more urgent caller may have started its own since
    const forget = () => {
      if (this.pending.get(ciphertext) === decryption) {
        this.pending.delete(ciphertext)
      }
    }

    this.pending.set(ciphertext, decryption)
    promise.then(forget, forget)

    return promise
  }
}
