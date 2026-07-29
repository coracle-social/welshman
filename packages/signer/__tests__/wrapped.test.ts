import {describe, expect, it} from "vitest"
import {Nip01Signer} from "../src/signers/nip01"
import {WrappedSigner} from "../src/util"
import {testSigner} from "./common"

const makeSigner = () =>
  new WrappedSigner(Nip01Signer.fromSecret("ee".repeat(32)), (_method, thunk) => thunk())

describe("WrappedSigner", () => {
  testSigner("WrappedSigner", makeSigner)

  // Callers hand these methods off on their own — nip-42 auth passes `sign` straight to a
  // socket policy — so they have to keep working without their receiver
  it("should keep working when its methods are detached", async () => {
    const {sign, getPubkey} = makeSigner()
    const signed = await sign({kind: 1, created_at: 1000, tags: [], content: "test"})

    expect(signed.pubkey).toBe(await getPubkey())
  })
})
