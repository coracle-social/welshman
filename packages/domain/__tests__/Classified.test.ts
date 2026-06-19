import {describe, it, expect} from "vitest"
import {makeSecret, CLASSIFIED, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Classified, ClassifiedBuilder} from "../src/kinds/Classified"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: CLASSIFIED,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Classified", () => {
  it("reads represented tags and content", async () => {
    const event = makeEvent({
      content: "for sale",
      tags: [
        ["d", "abc"],
        ["title", "Bike"],
        ["summary", "A good bike"],
        ["price", "100", "USD"],
        ["status", "active"],
        ["image", "https://example.com/a.jpg"],
        ["image", "https://example.com/b.jpg"],
        ["t", "cycling"],
        ["alt", "x"],
      ],
    })

    const c = await Classified.fromEvent(event)

    expect(c.identifier()).toBe("abc")
    expect(c.title()).toBe("Bike")
    expect(c.summary()).toBe("A good bike")
    expect(c.price()).toEqual({amount: 100, currency: "USD"})
    expect(c.status()).toBe("active")
    expect(c.images()).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"])
    expect(c.topics()).toEqual(["cycling"])
    expect(c.content()).toBe("for sale")
  })

  it("defaults the price currency to SAT", async () => {
    const c = await Classified.fromEvent(makeEvent({tags: [["d", "x"], ["price", "50"]]}))

    expect(c.price()).toEqual({amount: 50, currency: "SAT"})
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "for sale",
      tags: [
        ["d", "abc"],
        ["title", "Bike"],
        ["summary", "A good bike"],
        ["price", "100", "USD"],
        ["status", "active"],
        ["image", "https://example.com/a.jpg"],
        ["image", "https://example.com/b.jpg"],
        ["t", "cycling"],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await Classified.fromEvent(event)).builder().toTemplate(signer)

    for (const key of ["d", "title", "summary", "price", "status"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags.filter(t => t[0] === "image").length).toBe(2)
    expect(tmpl.tags.filter(t => t[0] === "t").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["d", "abc"])
    expect(tmpl.tags).toContainEqual(["price", "100", "USD"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("for sale")
  })

  it("builds from a fresh builder with an auto-generated d", async () => {
    const tmpl = await new ClassifiedBuilder()
      .setTitle("Fresh")
      .setContent("desc")
      .setPrice(25)
      .setImages(["https://example.com/c.jpg"])
      .setTopics(["misc"])
      .toTemplate(signer)

    expect(tmpl.kind).toBe(CLASSIFIED)
    expect(tmpl.tags.find(t => t[0] === "d")?.[1]).toBeTruthy()
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["price", "25", "SAT"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/c.jpg"])
    expect(tmpl.tags).toContainEqual(["t", "misc"])
    expect(tmpl.content).toBe("desc")
  })

  it("throws on the wrong kind", async () => {
    await expect(Classified.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
