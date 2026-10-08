import {describe, it, expect} from "vitest"
import {makeEvent, getPow, minePow, prep, DIRECT_MESSAGE} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"
import {Nip01Signer} from "../src/signers/nip01.js"
import {ISigner} from "../src/util.js"
import {InvalidWrapError, Nip59, getSeal, getWrap} from "../src/nip59.js"

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

describe("Nip59 unwrap cache and signer failures", () => {
  const makeWrap = async (recipient: string) =>
    Nip59.fromSigner(Nip01Signer.ephemeral()).wrap(
      recipient,
      makeEvent(DIRECT_MESSAGE, {content: "secret"}),
    )

  // A busy signer fails the same way a wrap this user cannot read does; only the second is a verdict
  it("asks the signer again after a failure that was the signer own", async () => {
    const bob = Nip01Signer.ephemeral()
    const wrap = await makeWrap(await bob.getPubkey())
    let fail = true

    const flaky: ISigner = {
      ...bob,
      nip44: {
        encrypt: bob.nip44.encrypt,
        decrypt: (pubkey: string, message: string) => {
          if (fail) {
            fail = false

            throw new Error("Signer request timed out")
          }

          return bob.nip44.decrypt(pubkey, message)
        },
      },
    }

    const nip59 = Nip59.fromSigner(flaky)

    await expect(nip59.unwrap(wrap)).rejects.toThrow("Signer request timed out")
    expect((await nip59.unwrap(wrap)).content).toBe("secret")
  })

  it("answers a wrap it has decided against out of the cache", async () => {
    const alice = Nip01Signer.ephemeral()
    const bob = Nip01Signer.ephemeral()
    const wrapper = Nip01Signer.ephemeral()
    const bobPubkey = await bob.getPubkey()
    const rumor = await prep(makeEvent(DIRECT_MESSAGE, {content: "secret"}), await bob.getPubkey())
    const seal = await getSeal(alice, bobPubkey, rumor)
    const wrap = await getWrap(wrapper, bobPubkey, seal, [])

    let decryptions = 0

    const counted: ISigner = {
      ...bob,
      nip44: {
        encrypt: bob.nip44.encrypt,
        decrypt: (pubkey: string, message: string) => {
          decryptions++

          return bob.nip44.decrypt(pubkey, message)
        },
      },
    }

    const nip59 = Nip59.fromSigner(counted)

    await expect(nip59.unwrap(wrap)).rejects.toThrow(InvalidWrapError)
    expect(decryptions).toBe(2)

    await expect(nip59.unwrap(wrap)).rejects.toThrow(InvalidWrapError)
    expect(decryptions).toBe(2)
  })

  it("decides against a wrap whose seal is not an event, and remembers it", async () => {
    const bob = Nip01Signer.ephemeral()
    const wrapper = Nip01Signer.ephemeral()
    const wrap = await getWrap(wrapper, await bob.getPubkey(), {} as SignedEvent, [])
    const nip59 = Nip59.fromSigner(bob)

    await expect(nip59.unwrap(wrap)).rejects.toThrow(InvalidWrapError)
    await expect(nip59.unwrap(wrap)).rejects.toThrow(InvalidWrapError)
  })
})
