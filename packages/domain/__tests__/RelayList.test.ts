import {describe, it, expect} from "vitest"
import {makeSecret, RELAYS, NOTE, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayList} from "../src/kinds/RelayList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const both = "wss://both.example.com/"
const read = "wss://read.example.com/"
const write = "wss://write.example.com/"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAYS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("RelayList", () => {
  it("reads relay urls split by read/write mode", async () => {
    const reader = await RelayList.read(
      makeEvent({
        tags: [
          ["r", both],
          ["r", read, "read"],
          ["r", write, "write"],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.urls().sort()).toEqual([both, read, write].map(normalizeRelayUrl).sort())
    expect(reader.readUrls().sort()).toEqual([both, read].map(normalizeRelayUrl).sort())
    expect(reader.writeUrls().sort()).toEqual([both, write].map(normalizeRelayUrl).sort())
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await RelayList.read(
      makeEvent({
        tags: [
          ["r", both],
          ["r", read, "read"],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await RelayList.builder(reader).toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "r").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds modeless and single-mode relays via a fresh builder", async () => {
    const tmpl = await RelayList.builder()
      .addReadUrl(read)
      .addWriteUrl(write)
      .addReadUrl(both)
      .addWriteUrl(both)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(RELAYS)
    // both was added for read then write, so it should collapse to modeless.
    expect(tmpl.tags).toContainEqual(["r", both])
    expect(tmpl.tags).toContainEqual(["r", read, "read"])
    expect(tmpl.tags).toContainEqual(["r", write, "write"])
  })

  it("downgrades a modeless relay when one mode is removed", async () => {
    const tmpl = await RelayList.builder()
      .addReadUrl(both)
      .addWriteUrl(both)
      .removeReadUrl(both)
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["r", both, "write"])
    expect(tmpl.tags).not.toContainEqual(["r", both])
  })

  it("routes to both original and current relays so removed relays are notified", async () => {
    const reader = await RelayList.read(
      makeEvent({
        tags: [
          ["r", both],
          ["r", read, "read"],
          ["r", write, "write"],
        ],
      }),
    )

    // Drop the read-only relay, then read the builder's routes via its router.
    const builder = RelayList.builder(reader).removeReadUrl(read)
    const routes = await builder.routes()
    const urls = routes.map(sel => (sel.route.type === "relay" ? sel.route.url : ""))

    // `read` is gone from the event but still routed to (from the originals); the
    // surviving relays are routed to (from the current urls).
    expect(urls).toContain(normalizeRelayUrl(read))
    expect(urls).toContain(normalizeRelayUrl(both))
    expect(urls).toContain(normalizeRelayUrl(write))
  })

  it("throws on the wrong kind", async () => {
    await expect(RelayList.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
