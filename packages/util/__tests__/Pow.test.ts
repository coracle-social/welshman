import {describe, it, expect} from "vitest"
import {getPubkey, makeSecret, own, hash} from "../src/Keys"
import {makeEvent} from "../src/Events"
import {countLeadingZeroes, getPow, minePow} from "../src/Pow"

describe("Pow", () => {
  const pubkey = getPubkey(makeSecret())
  const event = () => own(makeEvent(1, {content: "mine me"}), pubkey)

  describe("countLeadingZeroes", () => {
    it("counts the zero bits an id opens with", () => {
      expect(countLeadingZeroes("f".repeat(64))).toEqual(0)
      expect(countLeadingZeroes("7" + "f".repeat(63))).toEqual(1)
      expect(countLeadingZeroes("00ff" + "f".repeat(60))).toEqual(8)
      expect(countLeadingZeroes("0000" + "1".repeat(60))).toEqual(19)
    })
  })

  describe("minePow", () => {
    // 8 bits is one attempt in 256, so the search is over before the test is.
    it("finds an id with the difficulty it was asked for", async () => {
      const mined = await minePow(event(), 8)

      expect(countLeadingZeroes(mined.id)).toBeGreaterThanOrEqual(8)
      expect(getPow(mined)).toEqual(8)
    })

    it("commits the difficulty it was asked for to the nonce tag", async () => {
      const mined = await minePow(event(), 4)
      const nonce = mined.tags.find(([key]) => key === "nonce")

      expect(nonce?.[2]).toEqual("4")
      expect(Number(nonce?.[1])).toBeGreaterThanOrEqual(0)
    })

    // Zero is no proof of work rather than an easy one, so a caller that mines
    // unconditionally publishes the same event it would have published anyway.
    it("leaves an event alone when no work was asked for", async () => {
      const unmined = event()

      expect(await minePow(unmined, 0)).toEqual(hash(unmined))
    })

    it("stops when its caller aborts", async () => {
      // 64 bits is out of reach, so only the signal ends this one.
      await expect(minePow(event(), 64, AbortSignal.abort())).rejects.toThrow()
    })
  })
})
