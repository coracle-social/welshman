import {describe, it, expect, vi, afterEach} from "vitest"
import {makeSecret, relay, ZAP_GOAL, ZAP_REQUEST, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {ZapRequest} from "../src/kinds/ZapRequest"
import {Zapper} from "../src/other/Zapper"
import {buildTemplate, markerResolver, read, write, INBOX} from "./helpers.js"

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

const makeZapped = (kind: number, tags: string[][] = []): TrustedEvent =>
  makeEvent({id: eventId, kind, tags})

const urlsIn = (tags: string[][]) => tags.find(t => t[0] === "relays")?.slice(1) ?? []

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

    const tmpl = await buildTemplate(
      write(ZapRequest, await read(ZapRequest, event), markerResolver),
      signer,
    )

    expect(urlsIn(tmpl.tags)).toEqual(["wss://relay.one/"])
    expect(tmpl.content).toBe("thanks!")
    expect(tmpl.tags.filter(t => t[0] === "amount").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "lnurl").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "relays").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(ZapRequest, undefined, markerResolver)
        .setAmount(1000)
        .setLnurl("lnurl1abc")
        .setRecipient(recipient)
        .setEvent(makeZapped(NOTE))
        .forceRoutes(relay("wss://relay.one"))
        .setContent("hi"),
      signer,
    )

    expect(tmpl.kind).toBe(ZAP_REQUEST)
    expect(tmpl.content).toBe("hi")
    expect(tmpl.tags).toContainEqual(["amount", "1000"])
    expect(tmpl.tags).toContainEqual(["lnurl", "lnurl1abc"])
    expect(tmpl.tags).toContainEqual(["p", recipient])
    expect(tmpl.tags).toContainEqual(["e", eventId])
    expect(tmpl.tags).toContainEqual(["relays", "wss://relay.one/"])
  })

  describe("receipt relays", () => {
    const goal = (...urls: string[]) => makeZapped(ZAP_GOAL, [["relays", ...urls]])

    it("defaults to the recipient's inbox", async () => {
      const writer = write(ZapRequest, undefined, markerResolver).setRecipient(recipient)

      expect(urlsIn((await buildTemplate(writer, signer)).tags)).toEqual([INBOX])
    })

    it("names nothing without a recipient", async () => {
      const tmpl = await buildTemplate(write(ZapRequest, undefined, markerResolver), signer)

      expect(tmpl.tags.some(t => t[0] === "relays")).toBe(false)
    })

    it("adds the relays a goal is totalled on", async () => {
      const writer = write(ZapRequest, undefined, markerResolver)
        .setRecipient(recipient)
        .setEvent(goal("wss://goal.one", "wss://goal.two"))

      expect(await writer.relays()).toEqual([INBOX, "wss://goal.one/", "wss://goal.two/"])
    })

    it("keeps a goal's relays when routes are forced", async () => {
      const writer = write(ZapRequest, undefined, markerResolver)
        .setRecipient(recipient)
        .setEvent(goal("wss://goal.one"))
        .forceRoutes(relay("wss://space.example"))

      expect(await writer.relays()).toEqual(["wss://space.example/", "wss://goal.one/"])
    })

    it("drops a previous goal's relays when the zapped event changes", async () => {
      const writer = write(ZapRequest, undefined, markerResolver)
        .setRecipient(recipient)
        .setEvent(goal("wss://goal.one"))
        .setEvent(makeZapped(NOTE))

      expect(await writer.relays()).toEqual([INBOX])
    })
  })

  it("toggles the anon tag and reads it back", async () => {
    const anon = await buildTemplate(write(ZapRequest).setAnonymous(true), signer)
    expect(anon.tags).toContainEqual(["anon"])
    expect((await read(ZapRequest, makeEvent({tags: [["anon"]]}))).anonymous()).toBe(true)

    const cleared = await buildTemplate(
      write(ZapRequest, await read(ZapRequest, makeEvent({tags: [["anon"]]}))).setAnonymous(false),
      signer,
    )
    expect(cleared.tags.some(t => t[0] === "anon")).toBe(false)
    expect((await read(ZapRequest, makeEvent())).anonymous()).toBe(false)
  })

  it("leaves amount undefined unless the tag is whole millisats", async () => {
    for (const amount of ["21000.9", "21000abc", "-1", ""]) {
      const req = await read(ZapRequest, makeEvent({tags: [["amount", amount]]}))

      expect(req.amount()).toBeUndefined()
    }

    expect((await read(ZapRequest, makeEvent({tags: [["amount", "21000"]]}))).amount()).toBe(21000)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(ZapRequest, makeEvent({kind: NOTE}))).rejects.toThrow()
  })

  describe("requestInvoice", () => {
    afterEach(() => vi.unstubAllGlobals())

    const zapper = new Zapper({
      lnurl: "lnurl1abc",
      callback: "https://ln.example.com/cb",
      pubkey: recipient,
      nostrPubkey: "bb".repeat(32),
    })

    // A writer whose context carries a signer, as production configures it.
    const signedWriter = () => {
      const writer = write(ZapRequest)
        .setAmount(21000)
        .setLnurl("lnurl1abc")
        .setRecipient(recipient)

      writer.context.signer = signer

      return writer
    }

    it("renders, signs, and fetches an invoice", async () => {
      const fetchMock = vi.fn(async (_url: string) => ({json: async () => ({pr: "lnbc210n1xxx"})}))
      vi.stubGlobal("fetch", fetchMock)

      const res = await signedWriter().requestInvoice(zapper)

      expect(res.invoice).toBe("lnbc210n1xxx")
      expect(res.error).toBeUndefined()
      expect(res.event.kind).toBe(ZAP_REQUEST)
      expect(fetchMock).toHaveBeenCalledOnce()

      const url = String(fetchMock.mock.calls[0][0])
      expect(url).toContain("https://ln.example.com/cb")
      expect(url).toContain("amount=21000")
      expect(url).toContain("lnurl=lnurl1abc")
      expect(url).toContain("nostr=")
    })

    it("returns the service error when no invoice comes back", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({json: async () => ({reason: "too small"})})),
      )

      const res = await signedWriter().requestInvoice(zapper)

      expect(res.invoice).toBeUndefined()
      expect(res.error).toBe("too small")
    })

    it("returns a generic error when the response is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({json: async () => ({})})),
      )

      const res = await signedWriter().requestInvoice(zapper)

      expect(res.invoice).toBeUndefined()
      expect(res.error).toBe("Failed to request invoice")
    })

    it("throws without a signer", async () => {
      await expect(write(ZapRequest).setAmount(1).requestInvoice(zapper)).rejects.toThrow(
        "signer is required",
      )
    })

    it("throws rather than asking for an unreadable amount", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)

      const writer = write(ZapRequest).setRecipient(recipient).addTags(["amount", "21000.9"])

      writer.context.signer = signer

      await expect(writer.requestInvoice(zapper)).rejects.toThrow("whole number of millisats")
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
