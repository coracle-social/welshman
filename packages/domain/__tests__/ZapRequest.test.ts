import {describe, it, expect} from "vitest"
import {makeSecret, ZAP_REQUEST, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {ZapRequest} from "../src/kinds/ZapRequest"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const recipient = "aa".repeat(32)
const eventId = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ZAP_REQUEST,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("ZapRequest", () => {
  it("parses the represented tags and comment content", async () => {
    const event = makeEvent({
      content: "thanks!",
      tags: [
        ["amount", "21000"],
        ["lnurl", "lnurl1xyz"],
        ["p", recipient],
        ["e", eventId],
        ["relays", "wss://relay.one", "wss://relay.two"],
        ["alt", "x"],
      ],
    })

    const req = await read(ZapRequest, event)

    expect(req.amount()).toBe(21000)
    expect(req.lnurl()).toBe("lnurl1xyz")
    expect(req.recipient()).toBe(recipient)
    expect(req.eventId()).toBe(eventId)
    expect(req.urls()).toEqual(["wss://relay.one", "wss://relay.two"])
    expect(req.content()).toBe("thanks!")
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      content: "thanks!",
      tags: [
        ["amount", "21000"],
        ["lnurl", "lnurl1xyz"],
        ["p", recipient],
        ["e", eventId],
        ["relays", "wss://relay.one"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(ZapRequest, await read(ZapRequest, event)), signer)

    expect(tmpl.content).toBe("thanks!")
    expect(tmpl.tags.filter(t => t[0] === "amount").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "lnurl").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "relays").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(write(ZapRequest)
      .setAmount(1000)
      .setLnurl("lnurl1abc")
      .setRecipient(recipient)
      .setEventId(eventId)
      .setUrls(["wss://relay.one"])
      .setContent("hi"), signer)

    expect(tmpl.kind).toBe(ZAP_REQUEST)
    expect(tmpl.content).toBe("hi")
    expect(tmpl.tags).toContainEqual(["amount", "1000"])
    expect(tmpl.tags).toContainEqual(["lnurl", "lnurl1abc"])
    expect(tmpl.tags).toContainEqual(["p", recipient])
    expect(tmpl.tags).toContainEqual(["e", eventId])
    expect(tmpl.tags).toContainEqual(["relays", "wss://relay.one"])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(ZapRequest, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
