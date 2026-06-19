import {describe, it, expect} from "vitest"
import {makeSecret, HANDLER_INFORMATION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Handler, HandlerBuilder} from "../src/kinds/Handler"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: HANDLER_INFORMATION,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Handler", () => {
  it("parses JSON metadata content and k tags", async () => {
    const event = makeEvent({
      content: JSON.stringify({
        name: "Coracle",
        about: "a client",
        image: "https://example.com/i.png",
        website: "https://example.com",
        lud16: "a@example.com",
        nip05: "a@example.com",
      }),
      tags: [
        ["d", "myhandler"],
        ["k", "1"],
        ["k", "30023"],
        ["alt", "x"],
      ],
    })

    const handler = await Handler.fromEvent(event)

    expect(handler.values.name).toBe("Coracle")
    expect(handler.name()).toBe("Coracle")
    expect(handler.about()).toBe("a client")
    expect(handler.image()).toBe("https://example.com/i.png")
    expect(handler.website()).toBe("https://example.com")
    expect(handler.lud16()).toBe("a@example.com")
    expect(handler.nip05()).toBe("a@example.com")
    expect(handler.kinds()).toEqual([1, 30023])
  })

  it("maps display_name and picture aliases to canonical accessors", async () => {
    const handler = await Handler.fromEvent(
      makeEvent({
        content: JSON.stringify({display_name: "Alias", picture: "https://example.com/p.png"}),
      }),
    )

    expect(handler.name()).toBe("Alias")
    expect(handler.image()).toBe("https://example.com/p.png")
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      content: JSON.stringify({name: "Coracle", about: "a client"}),
      tags: [
        ["d", "myhandler"],
        ["k", "1"],
        ["k", "30023"],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await Handler.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "k").length).toBe(2)
    // The d identifier is passed through untouched.
    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])

    // Content re-serializes the parsed metadata.
    const parsed = JSON.parse(tmpl.content)
    expect(parsed.name).toBe("Coracle")
    expect(parsed.about).toBe("a client")
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new HandlerBuilder()
      .setName("MyApp")
      .setAbout("does things")
      .setWebsite("https://my.app")
      .setKinds([1, 7])
      .toTemplate(signer)

    expect(tmpl.kind).toBe(HANDLER_INFORMATION)
    const parsed = JSON.parse(tmpl.content)
    expect(parsed.name).toBe("MyApp")
    expect(parsed.about).toBe("does things")
    expect(parsed.website).toBe("https://my.app")
    expect(tmpl.tags).toContainEqual(["k", "1"])
    expect(tmpl.tags).toContainEqual(["k", "7"])
  })

  it("throws on the wrong kind", async () => {
    await expect(Handler.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
