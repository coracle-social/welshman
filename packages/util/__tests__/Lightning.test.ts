import {describe, it, vi, expect, beforeEach} from "vitest"
import {
  hrpToMillisat,
  getInvoiceAmount,
  getLnUrl,
  isBolt12Offer,
  isBolt12PayerProof,
  isBolt12ZapId,
  isMsats,
  makeBolt12ZapId,
  toMsats,
} from "../src/Lightning"

describe("Lightning", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("toMsats", () => {
    it("returns whole millisats for fractional sats", () => {
      expect(toMsats(2.3)).toBe(2300)
      expect(toMsats(21)).toBe(21000)
    })
  })

  describe("hrpToMillisat", () => {
    it("should convert basic amounts", () => {
      expect(hrpToMillisat("100")).toBe(BigInt(10000000000000))
    })

    it("should handle milli amounts", () => {
      expect(hrpToMillisat("100m")).toBe(BigInt(10000000000))
    })

    it("should handle micro amounts", () => {
      expect(hrpToMillisat("100u")).toBe(BigInt(10000000))
    })

    it("should handle nano amounts", () => {
      expect(hrpToMillisat("100n")).toBe(BigInt(10000))
    })

    it("should handle pico amounts", () => {
      expect(hrpToMillisat("100p")).toBe(BigInt(10))
    })

    it("should throw on invalid multiplier", () => {
      expect(() => hrpToMillisat("100x")).toThrow("Not a valid multiplier for the amount")
    })

    it("should throw on invalid amount", () => {
      expect(() => hrpToMillisat("ppp")).toThrow("Not a valid human readable amount")
    })

    it("should throw on amount outside valid range", () => {
      expect(() => hrpToMillisat("2100000000000000001")).toThrow("Amount is outside of valid range")
    })
  })

  describe("getInvoiceAmount", () => {
    it("should extract amount from bolt11 invoice", () => {
      const bolt11 = "lnbc100n1..." // Simplified for test
      expect(getInvoiceAmount(bolt11)).toBe(10000)
    })
  })

  describe("getLnUrl", () => {
    it("should handle lnurl1 addresses", () => {
      const lnurl =
        "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns"
      expect(getLnUrl(lnurl)).toBe(lnurl)
    })

    it("should encode regular URLs", () => {
      const url = "https://example.com/.well-known/lnurlp/test"
      const result = getLnUrl(url)
      expect(result?.startsWith("lnurl1")).toBe(true)
    })

    it("should handle lud16 addresses", () => {
      const address = "user@domain.com"
      const result = getLnUrl(address)
      expect(result?.startsWith("lnurl1")).toBe(true)
    })

    it("should return null for invalid input", () => {
      expect(getLnUrl("invalid")).toBeUndefined()
    })
  })

  describe("BOLT12", () => {
    it("takes an offer in either case, separators and all", () => {
      expect(isBolt12Offer("LNO1QGSY+AB C")).toBe(true)
      expect(isBolt12Offer("lnbc100n1pjexample")).toBe(false)
    })

    it("takes an lnp payer proof in either case", () => {
      expect(isBolt12PayerProof("lnp1qqsexampleproof")).toBe(true)
      expect(isBolt12PayerProof("LNP1QQSEXAMPLEPROOF")).toBe(true)
      expect(isBolt12PayerProof("lnbc100n1pjexample")).toBe(false)
    })

    it("requires a zap id of whole bytes, at least sixteen of them", () => {
      expect(isBolt12ZapId(makeBolt12ZapId())).toBe(true)
      expect(isBolt12ZapId("a".repeat(32))).toBe(true)
      expect(isBolt12ZapId("a".repeat(33))).toBe(false)
      expect(isBolt12ZapId("a".repeat(31))).toBe(false)
      expect(isBolt12ZapId("A".repeat(32))).toBe(false)
    })

    it("reads an amount as millisats only when it is a whole number", () => {
      expect(isMsats("21000")).toBe(true)
      expect(isMsats("21000.9")).toBe(false)
      expect(isMsats("21000abc")).toBe(false)
      expect(isMsats("")).toBe(false)
    })
  })
})
