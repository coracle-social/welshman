import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getZapSplits, splitZapAmount} from "../src/behaviors/ZapSplits"

const author = "aa".repeat(32)
const a = "11".repeat(32)
const b = "22".repeat(32)

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: author,
    created_at: 0,
    kind: NOTE,
    tags,
    content: "",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("ZapSplits", () => {
  describe("getZapSplits", () => {
    it("defaults to the author when there are no zap tags", () => {
      expect(getZapSplits(makeEvent([["p", a]]))).toEqual([{pubkey: author, weight: 1}])
    })

    it("splits equally when no weights are present", () => {
      const splits = getZapSplits(
        makeEvent([
          ["zap", a, "wss://one.relay"],
          ["zap", b, ""],
        ]),
      )

      expect(splits).toEqual([
        {pubkey: a, relay: "wss://one.relay", weight: 1},
        {pubkey: b, relay: undefined, weight: 1},
      ])
    })

    it("drops unweighted recipients to weight 0 when any weight is present", () => {
      const splits = getZapSplits(
        makeEvent([
          ["zap", a, "", "3"],
          ["zap", b, ""],
        ]),
      )

      expect(splits).toEqual([
        {pubkey: a, relay: undefined, weight: 3},
        {pubkey: b, relay: undefined, weight: 0},
      ])
    })

    it("ignores zap tags with no pubkey", () => {
      expect(getZapSplits(makeEvent([["zap"]]))).toEqual([{pubkey: author, weight: 1}])
    })
  })

  describe("splitZapAmount", () => {
    it("divides proportionally and hands the remainder to the top recipient", () => {
      const amounts = splitZapAmount(
        makeEvent([
          ["zap", a, "", "2"],
          ["zap", b, "", "1"],
        ]),
        100,
      )

      expect(amounts.map(s => s.amount)).toEqual([67, 33])
      expect(amounts.reduce((t, s) => t + s.amount, 0)).toBe(100)
    })

    it("zaps nobody when every weight is 0", () => {
      const amounts = splitZapAmount(
        makeEvent([
          ["zap", a, "", "0"],
          ["zap", b, "", "0"],
        ]),
        100,
      )

      expect(amounts.map(s => s.amount)).toEqual([0, 0])
    })

    it("gives the whole amount to the author by default", () => {
      const amounts = splitZapAmount(makeEvent([]), 100)

      expect(amounts).toEqual([{pubkey: author, weight: 1, amount: 100}])
    })
  })
})
