import {describe, it, expect} from "vitest"
import {makeSecret, BLOCKED_RELAYS, NOTE, getTagValues, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {BlockedRelayList} from "../src/kinds/BlockedRelayList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const r1 = "wss://relay.one.example/"
const r2 = "wss://relay.two.example/"
const r3 = "wss://relay.three.example/"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BLOCKED_RELAYS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("BlockedRelayList", () => {
  it("reads relay urls from relay tags", async () => {
    const event = makeEvent({
      tags: [
        ["relay", r1],
        ["relay", r2],
        ["alt", "x"],
      ],
    })

    const list = await BlockedRelayList.read(event)

    expect(list.urls().sort()).toEqual([r1, r2].sort())
    expect(list.includes(r1)).toBe(true)
    expect(list.includes(r3)).toBe(false)
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["relay", r1],
        ["relay", r2],
        ["alt", "x"],
      ],
    })

    const list = await BlockedRelayList.read(event)
    const tmpl = await BlockedRelayList.builder(list).toTemplate(signer)

    expect(tmpl.kind).toBe(BLOCKED_RELAYS)
    expect(tmpl.tags.filter(t => t[0] === "relay").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder and normalizes urls", async () => {
    const tmpl = await BlockedRelayList.builder()
      .addUrl("wss://relay.one.example")
      .toTemplate(signer)

    expect(getTagValues("relay", tmpl.tags)).toEqual([normalizeRelayUrl("wss://relay.one.example")])
  })

  it("setRelays replaces existing relays", async () => {
    const event = makeEvent({tags: [["relay", r1]]})
    const list = await BlockedRelayList.read(event)

    const tmpl = await BlockedRelayList.builder(list).setUrls([r2, r3]).toTemplate(signer)

    expect(getTagValues("relay", tmpl.tags).sort()).toEqual([r2, r3].sort())
  })

  it("throws on the wrong kind", async () => {
    await expect(BlockedRelayList.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
