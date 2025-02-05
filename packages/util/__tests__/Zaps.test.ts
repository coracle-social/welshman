import {describe, it, vi, expect, beforeEach} from "vitest"
import {hrpToMillisat, getInvoiceAmount, getLnUrl, zapFromEvent, Zapper} from "../src/Zaps"
import type {TrustedEvent} from "../src/Events"
import {now} from "@welshman/lib"

describe("Zaps", () => {
  const recipient = "dd".repeat(32)
  const zapper = "ee".repeat(32)
  // nostrPubkey is the pubkey the ln server will use to sign zap receipt events
  const nostrPubkey = "ff".repeat(32)
  const currentTime = now()

  beforeEach(() => {
    vi.clearAllMocks()
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
      expect(getLnUrl("invalid")).toBeNull()
    })
  })

  describe("zapFromEvent", () => {
    const createZapRequest = (): TrustedEvent => ({
      id: "ff".repeat(32),
      sig: "00".repeat(64),
      kind: 9734,
      pubkey: zapper,
      created_at: currentTime,
      content: "",
      tags: [
        ["amount", "100000"],
        ["lnurl", "lnurl1..."],
        ["p", recipient],
      ],
    })

    const createZapReceipt = (request: TrustedEvent): TrustedEvent => ({
      id: "aa".repeat(32),
      sig: "11".repeat(64),
      kind: 9735,
      pubkey: nostrPubkey,
      created_at: currentTime + 60,
      content: "",
      tags: [
        ["bolt11", "lnbc1000n1..."],
        ["description", JSON.stringify(request)],
        ["p", recipient],
        ["P", zapper],
      ],
    })

    const validZapper: Zapper = {
      lnurl: "lnurl1...",
      pubkey: recipient,
      nostrPubkey: nostrPubkey,
      callback: "https://example.com/callback",
      minSendable: 1000,
      maxSendable: 100000000,
      allowsNostr: true,
    }

    it("should validate a legitimate zap", () => {
      const request = createZapRequest()
      const response = createZapReceipt(request)

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeTruthy()
      expect(result?.request).toEqual(request)
      expect(result?.response).toEqual(response)
      expect(result?.invoiceAmount).toBe(100000)
    })

    it("should reject self-zaps", () => {
      const request = createZapRequest()
      request.pubkey = validZapper.pubkey! // Self-zap
      const response = createZapReceipt(request)

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeNull()
    })

    it("should reject amount mismatch", () => {
      const request = createZapRequest()
      const response = createZapReceipt(request)
      response.tags = response.tags.map(tag =>
        tag[0] === "bolt11" ? ["bolt11", "lnbc200n1..."] : tag,
      )

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeNull()
    })

    it("should reject incorrect zapper pubkey", () => {
      const request = createZapRequest()
      const response = createZapReceipt(request)
      response.pubkey = "deadbeef".repeat(8) // Not the ln server pubkey

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeNull()
    })

    it("should reject incorrect lnurl", () => {
      const request = createZapRequest()
      request.tags = request.tags.map(tag =>
        tag[0] === "lnurl" ? ["lnurl", "different_lnurl"] : tag,
      )
      const response = createZapReceipt(request)

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeNull()
    })

    it("should handle invalid description JSON", () => {
      const response = createZapReceipt(createZapRequest())
      response.tags = response.tags.map(tag =>
        tag[0] === "description" ? ["description", "invalid json"] : tag,
      )

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeNull()
    })

    it("should accept zap when recipient is zapper", () => {
      const request = createZapRequest()
      const response = createZapReceipt(request)
      response.pubkey = recipient // Recipient is zapper

      const result = zapFromEvent(response, validZapper)

      expect(result).toBeTruthy()
    })
  })
})
