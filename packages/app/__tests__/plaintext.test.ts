import {describe, it, expect, vi} from "vitest"
import {Nip01Signer} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {defaultAppPolicies} from "../src/policy.js"
import {Plaintext} from "../src/plugins/plaintext.js"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {promise, resolve, reject}
}

describe("Plaintext", () => {
  it("shares one decrypt between concurrent callers for a ciphertext", async () => {
    const plaintext = new App().use(Plaintext)
    const {promise, resolve} = deferred<string>()
    const decrypt = vi.fn(() => promise)

    const results = [
      plaintext.ensure("ciphertext", decrypt),
      plaintext.ensure("ciphertext", decrypt),
      plaintext.ensure("ciphertext", decrypt),
    ]

    resolve("hello")

    expect(await Promise.all(results)).toEqual(["hello", "hello", "hello"])
    expect(decrypt).toHaveBeenCalledTimes(1)
    expect(plaintext.get("ciphertext")).toEqual("hello")
  })

  it("keeps concurrent callers for different ciphertexts independent", async () => {
    const plaintext = new App().use(Plaintext)
    const decrypt = vi.fn((ciphertext: string) => async () => `plain ${ciphertext}`)

    const results = await Promise.all([
      plaintext.ensure("one", decrypt("one")),
      plaintext.ensure("two", decrypt("two")),
    ])

    expect(results).toEqual(["plain one", "plain two"])
    expect(plaintext.get("one")).toEqual("plain one")
    expect(plaintext.get("two")).toEqual("plain two")
  })

  it("reads a completed plaintext from the cache", async () => {
    const plaintext = new App().use(Plaintext)
    const decrypt = vi.fn(async () => "hello")

    expect(await plaintext.ensure("ciphertext", decrypt)).toEqual("hello")
    expect(await plaintext.ensure("ciphertext", decrypt)).toEqual("hello")
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it("doesn't keep an urgent caller waiting on a background decrypt", async () => {
    const plaintext = new App().use(Plaintext)
    const background = deferred<string>()
    const decrypt = vi.fn().mockReturnValueOnce(background.promise).mockResolvedValueOnce("hello")

    plaintext.ensure("ciphertext", decrypt, {priority: -1})

    expect(await plaintext.ensure("ciphertext", decrypt)).toEqual("hello")
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it("decrypts for a caller whose shared decrypt was aborted by the caller that asked for it", async () => {
    const plaintext = new App().use(Plaintext)
    const first = deferred<string>()
    const controller = new AbortController()
    const decrypt = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce("hello")

    const aborted = plaintext.ensure("ciphertext", decrypt, {signal: controller.signal})
    const sharer = plaintext.ensure("ciphertext", decrypt)

    controller.abort()
    first.reject(new Error("Signer request was aborted"))

    await expect(aborted).rejects.toThrow("aborted")
    expect(await sharer).toEqual("hello")
  })

  it("caches nothing when a decrypt fails, and decrypts again on the next call", async () => {
    const plaintext = new App().use(Plaintext)
    const {promise, reject} = deferred<string>()
    const decrypt = vi.fn().mockReturnValueOnce(promise).mockResolvedValueOnce("hello")

    const attempts = [
      plaintext.ensure("ciphertext", decrypt),
      plaintext.ensure("ciphertext", decrypt),
    ]

    reject(new Error("refused"))

    await expect(Promise.all(attempts)).rejects.toThrow("refused")
    expect(decrypt).toHaveBeenCalledTimes(1)
    expect(plaintext.get("ciphertext")).toBeUndefined()

    expect(await plaintext.ensure("ciphertext", decrypt)).toEqual("hello")
    expect(decrypt).toHaveBeenCalledTimes(2)
  })

  it("prompts the user's signer once when two views decrypt a message at the same time", async () => {
    const signer = Nip01Signer.ephemeral()
    const user = await User.fromSigner(signer)
    const app = new App({user, policies: defaultAppPolicies})
    const peer = await Nip01Signer.ephemeral().getPubkey()
    const ciphertext = await signer.nip44.encrypt(peer, "hello")
    const decrypt = vi.spyOn(signer.nip44, "decrypt")

    const results = await Promise.all([
      user.signer.nip44.decrypt(peer, ciphertext),
      user.signer.nip44.decrypt(peer, ciphertext),
      user.signer.nip44.decrypt(peer, ciphertext),
    ])

    expect(results).toEqual(["hello", "hello", "hello"])
    expect(decrypt).toHaveBeenCalledTimes(1)

    app.cleanup()
  })
})
