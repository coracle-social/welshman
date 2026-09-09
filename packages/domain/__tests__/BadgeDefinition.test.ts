import {describe, it, expect} from "vitest"
import {makeSecret, BADGE_DEFINITION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {BadgeDefinition} from "../src/kinds/BadgeDefinition"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BADGE_DEFINITION,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("BadgeDefinition", () => {
  it("reads represented tags", async () => {
    const badge = await read(
      BadgeDefinition,
      makeEvent({
        tags: [
          ["d", "bravery"],
          ["name", "Medal of Bravery"],
          ["description", "Awarded for bravery"],
          ["image", "https://example.com/badge.png", "1024x1024"],
          ["thumb", "https://example.com/thumb.png", "256x256"],
          ["thumb", "https://example.com/tiny.png"],
        ],
      }),
    )

    expect(badge.identifier()).toBe("bravery")
    expect(badge.name()).toBe("Medal of Bravery")
    expect(badge.description()).toBe("Awarded for bravery")
    expect(badge.image()).toEqual({url: "https://example.com/badge.png", dim: "1024x1024"})
    expect(badge.thumbs()).toEqual([
      {url: "https://example.com/thumb.png", dim: "256x256"},
      {url: "https://example.com/tiny.png", dim: undefined},
    ])
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      tags: [
        ["d", "bravery"],
        ["name", "Medal of Bravery"],
        ["image", "https://example.com/badge.png", "1024x1024"],
        ["thumb", "https://example.com/thumb.png", "256x256"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(
      write(BadgeDefinition, await read(BadgeDefinition, event)),
      signer,
    )

    for (const key of ["d", "name", "image", "thumb"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/badge.png", "1024x1024"])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder, omitting an absent dimension", async () => {
    const tmpl = await buildTemplate(
      write(BadgeDefinition)
        .setIdentifier("bravery")
        .setName("Medal of Bravery")
        .setDescription("Awarded for bravery")
        .setImage({url: "https://example.com/badge.png"})
        .setThumbs([{url: "https://example.com/thumb.png", dim: "256x256"}]),
      signer,
    )

    expect(tmpl.kind).toBe(BADGE_DEFINITION)
    expect(tmpl.tags).toContainEqual(["d", "bravery"])
    expect(tmpl.tags).toContainEqual(["name", "Medal of Bravery"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/badge.png"])
    expect(tmpl.tags).toContainEqual(["thumb", "https://example.com/thumb.png", "256x256"])
  })

  it("requires a d tag", async () => {
    await expect(
      buildTemplate(write(BadgeDefinition).setName("Nameless"), signer),
    ).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(BadgeDefinition, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
