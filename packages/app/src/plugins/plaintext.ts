import {MapPlugin} from "./base.js"

/**
 * A cache of decrypted content, keyed by the ciphertext. Decryption itself is
 * supplied by the caller (the signer's underlying decrypt), so the cache stays
 * independent of which signer produced the plaintext — and `appPolicyCacheDecrypt`
 * can layer it onto `user.signer` without recursing back into the wrapped signer.
 */
export class Plaintext extends MapPlugin<string> {
  ensure = async (ciphertext: string, decrypt: () => Promise<string>): Promise<string> => {
    let result = this.get(ciphertext)

    if (result === undefined) {
      result = await decrypt()

      this.set(ciphertext, result)
    }

    return result
  }
}
