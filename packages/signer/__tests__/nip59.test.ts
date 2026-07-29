import {describe, it, expect} from "vitest"
import {makeEvent, DIRECT_MESSAGE} from "@welshman/util"
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
