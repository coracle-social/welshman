import {NostrSignerPlugin} from "nostr-signer-capacitor-plugin"
import {describe, beforeEach, vi, it, expect} from "vitest"
import {Nip55Signer} from "../src/signers/nip55"
import {testSigner} from "./common"
import {npubEncode} from "nostr-tools/nip19"

vi.mock("nostr-signer-capacitor-plugin", () => ({
  NostrSignerPlugin: {
    setPackageName: vi.fn().mockResolvedValue(undefined),
    getPublicKey: vi.fn(() => ({npub: npubEncode("ee".repeat(32)), package: "test-package"})),
    signEvent: vi.fn().mockResolvedValue({
      event: JSON.stringify({sig: "ee".repeat(64)}),
      signature: "ee".repeat(64),
      id: "00".repeat(32),
    }),
    nip04Encrypt: vi.fn((_package_name, plain_text) => ({
      result: "encrypted:" + plain_text,
      id: "1",
    })),
    nip04Decrypt: vi.fn((_package_name, encrypted_text) => ({
      result: encrypted_text.split("encrypted:")[1],
      id: "1",
    })),
    nip44Encrypt: vi.fn((_package_name, plain_text) => ({
      result: "encrypted:" + plain_text,
      id: "1",
    })),
    nip44Decrypt: vi.fn((_package_name, encrypted_text) => ({
      result: encrypted_text.split("encrypted:")[1],
      id: "1",
    })),
  },
}))

describe("Nip55Signer", () => {
  beforeEach(() => {
    // Mock NostrSignerPlugin
  })

  testSigner("Nip55Signer", () => new Nip55Signer("test-package"))

  // Additional NIP-55 specific tests
  it("should handle package initialization", async () => {
    const signer = new Nip55Signer("test-package")
    await signer.getPubkey()
    expect(NostrSignerPlugin.setPackageName).toHaveBeenCalledWith("test-package")
  })
})
