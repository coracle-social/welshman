import {beforeEach, describe, expect, it, vi} from "vitest"
import {Nip07Signer} from "../src/signers/nip07"
import {testSigner} from "./common"
import {SignedEvent} from "@welshman/util"

describe("Nip07Signer", () => {
  beforeEach(() => {
    // Mock window.nostr
    ;(window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue("ee".repeat(32)),
      signEvent: vi.fn().mockResolvedValue({sig: "ff".repeat(64)} as SignedEvent),
      nip04: {
        encrypt: vi.fn((pubkey, message) => "encrypted:" + message),
        decrypt: vi.fn((pubkey, encryptedMessage) => encryptedMessage.split("encrypted:")[1]),
      },
      nip44: {
        encrypt: vi.fn((pubkey, message) => "encrypted:" + message),
        decrypt: vi.fn((pubkey, encryptedMessage) => encryptedMessage.split("encrypted:")[1]),
      },
    }
  })

  testSigner("Nip07Signer", () => new Nip07Signer())

  // Additional NIP-07 specific tests
  it("should handle missing extension", async () => {
    delete (window as any).nostr
    const signer = new Nip07Signer()
    await expect(signer.getPubkey()).rejects.toThrow("Nip07 is not enabled")
  })
})
