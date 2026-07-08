import {describe, it, expect} from "vitest"
import {PINBOARD, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Pinboard} from "../src/kinds/Pinboard"

const pubkey = "ee".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: PINBOARD,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("Pinboard", () => {
  it("reads metadata, topics and the collaborative flag", async () => {
    const reader = await Pinboard.read(
      makeEvent({
        tags: [
          ["d", "japan-trip-2024"],
          ["title", "Japan Trip 2024"],
          ["description", "Photos and memories"],
          ["image", "https://example.com/mt-fuji.jpg"],
          ["t", "japan"],
          ["t", "travel"],
          ["collaborative"],
        ],
      }),
    )

    expect(reader.identifier()).toBe("japan-trip-2024")
    expect(reader.title()).toBe("Japan Trip 2024")
    expect(reader.description()).toBe("Photos and memories")
    expect(reader.image()).toBe("https://example.com/mt-fuji.jpg")
    expect(reader.topics()).toEqual(["japan", "travel"])
    expect(reader.collaborative()).toBe(true)
  })

  it("treats a board without the flag as non-collaborative", async () => {
    const reader = await Pinboard.read(
      makeEvent({
        tags: [
          ["d", "x"],
          ["title", "x"],
        ],
      }),
    )

    expect(reader.collaborative()).toBe(false)
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await Pinboard.builder()
      .setIdentifier("japan-trip-2024")
      .setTitle("Japan Trip 2024")
      .setDescription("Photos and memories")
      .setImage("https://example.com/mt-fuji.jpg")
      .setTopics(["japan", "travel"])
      .setCollaborative(true)
      .toTemplate()

    expect(tmpl.kind).toBe(PINBOARD)
    expect(tmpl.tags).toContainEqual(["d", "japan-trip-2024"])
    expect(tmpl.tags).toContainEqual(["title", "Japan Trip 2024"])
    expect(tmpl.tags).toContainEqual(["description", "Photos and memories"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/mt-fuji.jpg"])
    expect(tmpl.tags).toContainEqual(["t", "japan"])
    expect(tmpl.tags).toContainEqual(["t", "travel"])
    expect(tmpl.tags).toContainEqual(["collaborative"])
  })

  it("replaces single-value metadata instead of duplicating it", async () => {
    const reader = await Pinboard.read(
      makeEvent({
        tags: [
          ["d", "x"],
          ["title", "Old"],
        ],
      }),
    )

    const tmpl = await Pinboard.builder(reader).setTitle("New").toTemplate()

    expect(tmpl.tags.filter(t => t[0] === "title")).toEqual([["title", "New"]])
  })

  it("setCollaborative(false) clears the flag", async () => {
    const reader = await Pinboard.read(
      makeEvent({tags: [["d", "x"], ["title", "x"], ["collaborative"]]}),
    )

    const tmpl = await Pinboard.builder(reader).setCollaborative(false).toTemplate()

    expect(tmpl.tags.some(t => t[0] === "collaborative")).toBe(false)
  })

  it("requires a d tag", async () => {
    await expect(Pinboard.builder().setTitle("x").toTemplate()).rejects.toThrow()
  })

  it("requires a title", async () => {
    await expect(Pinboard.builder().setIdentifier("x").toTemplate()).rejects.toThrow(/title/)
  })

  it("throws on the wrong kind", async () => {
    await expect(Pinboard.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
