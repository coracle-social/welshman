import {describe, it, expect} from "vitest"
import {makeSecret, ZAP_RECEIPT, ZAP_REQUEST, NOTE} from "@welshman/util"
import type {TrustedEvent, Zapper} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {ZapReceipt} from "../src/kinds/ZapReceipt"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const sender = "aa".repeat(32)
const recipient = "bb".repeat(32)
const eventId = "cc".repeat(32)

// hrp "100n" => 100 * 1e11 / 1e9 = 10000 millisats.
const bolt11 = "lnbc100n1pjexample"

// The embedded kind-9734 zap request carried inside the JSON "description" tag.
const request = {
  id: "11".repeat(32),
  pubkey: sender,
  created_at: 0,
  kind: ZAP_REQUEST,
  tags: [
    ["amount", "10000"],
    ["lnurl", "lnurl1xyz"],
  ],
  content: "thanks!",
  sig: "00".repeat(64),
}

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ZAP_RECEIPT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("ZapReceipt", () => {
  it("parses the represented tags and the embedded zap request", async () => {
    const event = makeEvent({
      tags: [
        ["bolt11", bolt11],
        ["description", JSON.stringify(request)],
        ["p", recipient],
        ["e", eventId],
        ["preimage", "abcd"],
        ["alt", "x"],
      ],
    })

    const receipt = await read(ZapReceipt, event)

    expect(receipt.bolt11()).toBe(bolt11)
    expect(receipt.invoiceAmount()).toBe(10000)
    expect(receipt.recipient()).toBe(recipient)
    expect(receipt.eventId()).toBe(eventId)
    expect(receipt.preimage()).toBe("abcd")

    // Parsed-values accessors derived from the JSON "description" tag.
    expect(receipt.request()).toEqual(request)
    expect(receipt.sender()).toBe(sender)
    expect(receipt.comment()).toBe("thanks!")
  })

  it("returns undefined invoice amount for a malformed bolt11", async () => {
    const receipt = await read(ZapReceipt, makeEvent({tags: [["bolt11", "not-an-invoice"]]}))

    expect(receipt.invoiceAmount()).toBeUndefined()
  })

  it("verifies a legitimate zap from a zapper", async () => {
    const event = makeEvent({
      pubkey: "dd".repeat(32),
      tags: [
        ["bolt11", bolt11],
        ["description", JSON.stringify(request)],
        ["p", recipient],
      ],
    })

    const receipt = await read(ZapReceipt, event)

    const zapper = {
      pubkey: recipient,
      lnurl: "lnurl1xyz",
      nostrPubkey: "dd".repeat(32),
    } as Zapper

    expect(receipt.verify(zapper)).toBe(true)
    // A forged receipt (wrong nostrPubkey) is rejected.
    expect(receipt.verify({...zapper, nostrPubkey: "ab".repeat(32)})).toBe(false)
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      tags: [
        ["bolt11", bolt11],
        ["description", JSON.stringify(request)],
        ["p", recipient],
        ["e", eventId],
        ["preimage", "abcd"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(ZapReceipt, await read(ZapReceipt, event)), signer)

    expect(tmpl.tags.filter(t => t[0] === "bolt11").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "description").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "preimage").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(ZapReceipt)
        .setBolt11(bolt11)
        .setDescription(JSON.stringify(request))
        .setRecipient(recipient)
        .setEventId(eventId)
        .setPreimage("abcd"),
      signer,
    )

    expect(tmpl.kind).toBe(ZAP_RECEIPT)
    expect(tmpl.tags).toContainEqual(["bolt11", bolt11])
    expect(tmpl.tags).toContainEqual(["p", recipient])
    expect(tmpl.tags).toContainEqual(["e", eventId])
    expect(tmpl.tags).toContainEqual(["preimage", "abcd"])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(ZapReceipt, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
