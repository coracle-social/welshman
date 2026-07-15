import {describe, it, expect} from "vitest"
import {now} from "@welshman/lib"
import {ZAP_RECEIPT} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Zapper} from "../src/other/Zapper"
import {ZapReceipt} from "../src/kinds/ZapReceipt"
import {read} from "./helpers.js"

const recipient = "dd".repeat(32)
const sender = "ee".repeat(32)
// nostrPubkey is the pubkey the ln server will use to sign zap receipt events
const nostrPubkey = "ff".repeat(32)

const createZapRequest = (): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    sig: "00".repeat(64),
    kind: 9734,
    pubkey: sender,
    created_at: 0,
    content: "",
    tags: [
      ["amount", "100000"],
      ["lnurl", "lnurl1..."],
      ["p", recipient],
    ],
  }) as TrustedEvent

const createZapReceipt = (request: TrustedEvent): TrustedEvent =>
  ({
    id: "aa".repeat(32),
    sig: "11".repeat(64),
    kind: 9735,
    pubkey: nostrPubkey,
    created_at: 60,
    content: "",
    tags: [
      ["bolt11", "lnbc1000n1..."],
      ["description", JSON.stringify(request)],
      ["p", recipient],
      ["P", sender],
    ],
  }) as TrustedEvent

// Parse a receipt event into the reader `Zapper.validate` expects.
const readReceipt = (response: TrustedEvent) => read(ZapReceipt, response)

const zapper = new Zapper({
  lnurl: "lnurl1...",
  pubkey: recipient,
  nostrPubkey,
  callback: "https://example.com/callback",
  minSendable: 1000,
  maxSendable: 100000000,
  allowsNostr: true,
})

describe("Zapper", () => {
  describe("validate", () => {
    it("validates a legitimate zap", async () => {
      const request = createZapRequest()
      const response = createZapReceipt(request)

      const result = zapper.validate(await readReceipt(response))

      expect(result).toBeTruthy()
      expect(result?.request).toEqual(request)
      expect(result?.response).toEqual(response)
      expect(result?.invoiceAmount).toBe(100000)
    })

    it("rejects self-zaps", async () => {
      const request = createZapRequest()
      request.pubkey = zapper.pubkey // Self-zap
      const response = createZapReceipt(request)

      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })

    it("rejects amount mismatch", async () => {
      const response = createZapReceipt(createZapRequest())
      response.tags = response.tags.map(tag =>
        tag[0] === "bolt11" ? ["bolt11", "lnbc200n1..."] : tag,
      )

      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })

    it("rejects an incorrect zapper pubkey", async () => {
      const response = createZapReceipt(createZapRequest())
      response.pubkey = "deadbeef".repeat(8) // Not the ln server pubkey

      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })

    it("rejects an incorrect lnurl", async () => {
      const request = createZapRequest()
      request.tags = request.tags.map(tag =>
        tag[0] === "lnurl" ? ["lnurl", "different_lnurl"] : tag,
      )
      const response = createZapReceipt(request)

      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })

    it("handles invalid description JSON", async () => {
      const response = createZapReceipt(createZapRequest())
      response.tags = response.tags.map(tag =>
        tag[0] === "description" ? ["description", "invalid json"] : tag,
      )

      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })

    it("accepts a self-hosted zap signed by the recipient", async () => {
      const selfZapper = new Zapper({lnurl: "lnurl1...", pubkey: recipient, nostrPubkey: recipient})
      const response = createZapReceipt(createZapRequest())
      response.pubkey = recipient // recipient runs their own zapper

      expect(selfZapper.validate(await readReceipt(response))).toBeTruthy()
    })

    it("rejects a self-signed receipt that isn't the zapper's key", async () => {
      const response = createZapReceipt(createZapRequest())
      response.pubkey = recipient // signed by the recipient, but not this zapper's key

      // No "recipient == signer" shortcut: the receipt must be signed by nostrPubkey.
      expect(zapper.validate(await readReceipt(response))).toBeUndefined()
    })
  })

  describe("getResponseFilter", () => {
    it("builds a filter scoped to the zapper and recipient", () => {
      const filter = zapper.getResponseFilter(recipient)

      expect(filter.kinds).toEqual([ZAP_RECEIPT])
      expect(filter.authors).toEqual([nostrPubkey])
      expect(filter["#p"]).toEqual([recipient])
      expect(filter["#e"]).toBeUndefined()
      expect(filter.since).toBeGreaterThanOrEqual(now() - 60)
    })

    it("scopes to an event when given one", () => {
      const filter = zapper.getResponseFilter(recipient, "cc".repeat(32))

      expect(filter["#e"]).toEqual(["cc".repeat(32)])
    })
  })
})
