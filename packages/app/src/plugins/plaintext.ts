import {MapPlugin} from "./base.js"

/**
 * A cache of decrypted content, keyed by the ciphertext. Decryption itself is
 * supplied by the caller (the signer's underlying decrypt), so the cache stays
 * independent of which signer produced the plaintext — and `appPolicyCacheDecrypt`
 * can layer it onto `user.signer` without recursing back into the wrapped signer.
 * Concurrent callers for one ciphertext share a single decrypt.
 */
export class Plaintext extends MapPlugin<string> {
  private pending = new Map<string, Promise<string>>()

  ensure = async (ciphertext: string, decrypt: () => Promise<string>): Promise<string> => {
    let result = this.get(ciphertext)

    if (result === undefined) {
      result = await this.decryptOnce(ciphertext, decrypt)
    }

    return result
  }

  private decryptOnce = (ciphertext: string, decrypt: () => Promise<string>) => {
    let promise = this.pending.get(ciphertext)

    if (!promise) {
      promise = decrypt()
        .then(plaintext => {
          this.set(ciphertext, plaintext)

          return plaintext
        })
        .finally(() => {
          this.pending.delete(ciphertext)
        })

      this.pending.set(ciphertext, promise)
    }

    return promise
  }
}
