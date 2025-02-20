import {ISigner} from "@welshman/signer"
import {StampedEvent} from "@welshman/util"
import {beforeEach, describe, expect, it} from "vitest"

// Common test suite for all signers
export const testSigner = (name: string, createSigner: () => ISigner) => {
  describe(name, () => {
    let signer: ISigner

    beforeEach(() => {
      signer = createSigner()
    })

    describe("getPubkey", () => {
      it("should return valid public key", async () => {
        const pubkey = await signer.getPubkey()
        expect(pubkey).toMatch(/^[0-9a-f]{64}$/) // hex pubkey
      })
    })

    describe("sign", () => {
      it("should sign event correctly", async () => {
        const event: StampedEvent = {
          kind: 1,
          created_at: 1000,
          tags: [],
          content: "test",
        }
        const signed = await signer.sign(event)
        expect(signed.sig).toMatch(/^[0-9a-f]{128}$/) // hex signature
      })
    })

    describe("nip04", () => {
      it("should encrypt and decrypt messages", async () => {
        const message = "test message"
        const pubkey = await signer.getPubkey()

        const encrypted = await signer.nip04.encrypt(pubkey, message)
        const decrypted = await signer.nip04.decrypt(pubkey, encrypted)

        expect(decrypted).toBe(message)
      })
    })

    describe("nip44", () => {
      it("should encrypt and decrypt messages", async () => {
        const message = "test message"
        const pubkey = await signer.getPubkey()

        const encrypted = await signer.nip44.encrypt(pubkey, message)
        const decrypted = await signer.nip44.decrypt(pubkey, encrypted)

        expect(decrypted).toBe(message)
      })
    })
  })
}
