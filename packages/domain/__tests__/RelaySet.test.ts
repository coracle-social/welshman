import {describe, it, expect} from "vitest"
import {makeSecret, NAMED_RELAYS, NOTE, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelaySet} from "../src/kinds/RelaySet"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const relayA = "wss://set-a.example.com/"
const relayB = "wss://set-b.example.com/"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: NAMED_RELAYS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("RelaySet", () => {
  it("reads metadata and relay urls", async () => {
    const reader = await read(RelaySet, 
      makeEvent({
        tags: [
          ["d", "my-set"],
          ["title", "My Set"],
          ["description", "a set of relays"],
          ["image", "https://example.com/img.png"],
          ["relay", relayA],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.identifier()).toBe("my-set")
    expect(reader.title()).toBe("My Set")
    expect(reader.description()).toBe("a set of relays")
    expect(reader.image()).toBe("https://example.com/img.png")
    expect(reader.urls()).toEqual([normalizeRelayUrl(relayA)])
  })

  it("round-trips metadata, d and relay tags exactly once each", async () => {
    const reader = await read(RelaySet, 
      makeEvent({
        tags: [
          ["d", "my-set"],
          ["title", "My Set"],
          ["description", "a set of relays"],
          ["image", "https://example.com/img.png"],
          ["relay", relayA],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(RelaySet, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "title").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "description").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "image").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "relay").length).toBe(1)
    // Metadata round-trips with the exact same values.
    expect(tmpl.tags).toContainEqual(["d", "my-set"])
    expect(tmpl.tags).toContainEqual(["title", "My Set"])
    expect(tmpl.tags).toContainEqual(["description", "a set of relays"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/img.png"])
    expect(tmpl.tags).toContainEqual(["relay", normalizeRelayUrl(relayA)])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(write(RelaySet)
      .setIdentifier("my-set")
      .setTitle("Fresh")
      .addUrl(relayA), signer)

    expect(tmpl.kind).toBe(NAMED_RELAYS)
    expect(tmpl.tags).toContainEqual(["d", "my-set"])
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["relay", normalizeRelayUrl(relayA)])
  })

  it("setRelays replaces relays but preserves metadata", async () => {
    const reader = await read(RelaySet, 
      makeEvent({
        tags: [
          ["d", "my-set"],
          ["title", "My Set"],
          ["relay", relayA],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(RelaySet, reader).setUrls([relayB]), signer)

    expect(tmpl.tags).toContainEqual(["relay", normalizeRelayUrl(relayB)])
    expect(tmpl.tags.some(t => t[0] === "relay" && t[1] === normalizeRelayUrl(relayA))).toBe(false)
    expect(tmpl.tags).toContainEqual(["title", "My Set"])
    expect(tmpl.tags).toContainEqual(["d", "my-set"])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelaySet, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
