import {describe, it, expect} from "vitest"
import {makeEvent, getPow, minePow, DIRECT_MESSAGE} from "@welshman/util"
import {Nip01Signer} from "../src/signers/nip01.js"
import {Nip59} from "../src/nip59.js"

describe("Nip59 unwrap cache", () => {
  it("caches per instance and does not share plaintext across instances", async () => {
    const alice = Nip01Signer.ephemeral()
    const bob = Nip01Signer.ephemeral()
    const mallory = Nip01Signer.ephemeral()
    const bobPubkey = await bob.getPubkey()

    const wrap = await Nip59.fromSigner(alice).wrap(
      bobPubkey,
      makeEvent(DIRECT_MESSAGE, {content: "secret"}),
    )

    const bobNip59 = Nip59.fromSigner(bob)
    const first = await bobNip59.unwrap(wrap)
    const second = await bobNip59.unwrap(wrap)

    expect(first.content).toBe("secret")
    expect(second).toBe(first) // cache hit on the same instance

    // A different identity must not read Bob's plaintext out of a shared cache
    await expect(Nip59.fromSigner(mallory).unwrap(wrap)).rejects.toThrow()
  })
})

describe("mining a wrap", () => {
  // A relay holding gift wraps may want work on one. The wrap is signed by a
  // one-time key, so the caller who owns that key mines what comes back and
  // signs it again, which is what the `Publisher`'s pow stage does with a request's `pow`.
  it("keeps the wrap attributed to the wrapper and readable by its recipient", async () => {
    const bob = Nip01Signer.ephemeral()
    const wrapper = Nip01Signer.ephemeral()
    const wrap = await Nip59.fromSigner(Nip01Signer.ephemeral())
      .withWrapper(wrapper)
      .wrap(await bob.getPubkey(), makeEvent(DIRECT_MESSAGE, {content: "secret"}))

    const mined = await wrapper.sign(await minePow(wrap, 8))

    expect(getPow(mined)).toEqual(8)
    expect(mined.pubkey).toEqual(await wrapper.getPubkey())
    expect((await Nip59.fromSigner(bob).unwrap(mined)).content).toBe("secret")
  })
})
