import {describe, it, expect} from "vitest"
import {makeSecret, HANDLER_RECOMMENDATION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {
  HandlerRecommendation,
  HandlerRecommendationBuilder,
} from "../src/kinds/HandlerRecommendation"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const webAddress = `31990:${"aa".repeat(32)}:web-handler`
const otherAddress = `31990:${"bb".repeat(32)}:other-handler`

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: HANDLER_RECOMMENDATION,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("HandlerRecommendation", () => {
  it("parses address tags and prefers the web handler", async () => {
    const event = makeEvent({
      tags: [
        ["d", "1"],
        ["a", otherAddress, "wss://relay.one", "android"],
        ["a", webAddress, "wss://relay.two", "web"],
        ["alt", "x"],
      ],
    })

    const rec = await HandlerRecommendation.fromEvent(event)

    expect(rec.addresses()).toEqual([otherAddress, webAddress])
    expect(rec.addressTags().length).toBe(2)
    // Prefers the recommendation marked "web".
    expect(rec.handlerAddress()).toBe(webAddress)
  })

  it("falls back to the first recommendation without a web marker", async () => {
    const rec = await HandlerRecommendation.fromEvent(
      makeEvent({tags: [["d", "1"], ["a", otherAddress, "", "android"]]}),
    )

    expect(rec.handlerAddress()).toBe(otherAddress)
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      tags: [
        ["d", "1"],
        ["a", otherAddress, "wss://relay.one", "android"],
        ["a", webAddress, "wss://relay.two", "web"],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await HandlerRecommendation.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    // The d identifier round-trips its value.
    expect(tmpl.tags.find(t => t[0] === "d")![1]).toBe("1")
  })

  it("builds from a fresh builder", async () => {
    const builder = new HandlerRecommendationBuilder()
    // The d identifier holds the recommended kind.
    builder.setIdentifier("1")

    const tmpl = await builder
      .addRecommendation(webAddress, "wss://relay.one", "web")
      // Duplicate addresses are ignored.
      .addRecommendation(webAddress, "wss://relay.one", "web")
      .toTemplate(signer)

    expect(tmpl.kind).toBe(HANDLER_RECOMMENDATION)
    expect(tmpl.tags).toContainEqual(["d", "1"])
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([
      ["a", webAddress, "wss://relay.one", "web"],
    ])
  })

  it("requires a d identifier", async () => {
    await expect(
      new HandlerRecommendationBuilder().addRecommendation(webAddress).toTemplate(signer),
    ).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(HandlerRecommendation.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
