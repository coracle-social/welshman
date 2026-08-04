import {NostrSignerPlugin} from "nostr-signer-capacitor-plugin"
import {describe, beforeEach, vi, it, expect} from "vitest"
import {Nip55, Nip55Signer, getNip55, setNip55Plugin} from "../src/signers/nip55"
import {testSigner} from "./common"
import {npubEncode} from "nostr-tools/nip19"

// The real plugin must keep satisfying the structural type we declare for it.
// It is pinned to a github branch, so this is the only thing catching drift.
NostrSignerPlugin satisfies Nip55

const makePlugin = () => ({
  setPackageName: vi.fn(() => Promise.resolve()),
  getInstalledSignerApps: vi.fn(() =>
    Promise.resolve({apps: [{name: "Amber", packageName: "com.greenart7c3.nostrsigner"}]}),
  ),
  getPublicKey: vi.fn(() => Promise.resolve({npub: npubEncode("ee".repeat(32))})),
  signEvent: vi.fn(() =>
    Promise.resolve({
      event: JSON.stringify({sig: "ee".repeat(64)}),
    }),
  ),
  nip04Encrypt: vi.fn((_p: string, plainText: string) =>
    Promise.resolve({result: "encrypted:" + plainText}),
  ),
  nip04Decrypt: vi.fn((_p: string, encryptedText: string) =>
    Promise.resolve({result: encryptedText.split("encrypted:")[1]}),
  ),
  nip44Encrypt: vi.fn((_p: string, plainText: string) =>
    Promise.resolve({result: "encrypted:" + plainText}),
  ),
  nip44Decrypt: vi.fn((_p: string, encryptedText: string) =>
    Promise.resolve({result: encryptedText.split("encrypted:")[1]}),
  ),
})

let plugin: ReturnType<typeof makePlugin>

describe("Nip55Signer", () => {
  beforeEach(() => {
    plugin = makePlugin()
    setNip55Plugin(plugin)
  })

  testSigner("Nip55Signer", () => new Nip55Signer("test-package"))

  // Additional NIP-55 specific tests
  it("should handle package initialization", async () => {
    const signer = new Nip55Signer("test-package")
    await signer.getPubkey()
    expect(plugin.setPackageName).toHaveBeenCalledWith("test-package")
    expect(plugin.getPublicKey).toHaveBeenCalledWith("test-package")
  })

  it("should list installed signer apps", async () => {
    expect(await getNip55()).toEqual([{name: "Amber", packageName: "com.greenart7c3.nostrsigner"}])
  })

  it("should throw when no plugin is registered", async () => {
    setNip55Plugin(undefined)

    await expect(new Nip55Signer("test-package").getPubkey()).rejects.toThrow(
      "Nip55 is not enabled",
    )
    expect(await getNip55()).toEqual([])
  })
})
