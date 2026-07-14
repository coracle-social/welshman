import {describe, it, expect} from "vitest"
import {makeSecret, RELAYS, NOTE, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayList} from "../src/kinds/RelayList"
import {buildTemplate, read, write, publishRelays, markerResolver} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const both = "wss://both.example.com/"
const readUrl = "wss://read.example.com/"
const writeUrl = "wss://write.example.com/"

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
    const reader = await read(
      RelayList,
      makeEvent({
        tags: [
          ["r", both],
          ["r", readUrl, "read"],
          ["r", writeUrl, "write"],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.urls().sort()).toEqual([both, readUrl, writeUrl].map(normalizeRelayUrl).sort())
    expect(reader.readUrls().sort()).toEqual([both, readUrl].map(normalizeRelayUrl).sort())
    expect(reader.writeUrls().sort()).toEqual([both, writeUrl].map(normalizeRelayUrl).sort())
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await read(
      RelayList,
      makeEvent({
        tags: [
          ["r", both],
          ["r", readUrl, "read"],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(RelayList, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "r").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds modeless and single-mode relays via a fresh writer", async () => {
    const tmpl = await buildTemplate(
      write(RelayList).addReadUrl(readUrl).addWriteUrl(writeUrl).addReadUrl(both).addWriteUrl(both),
      signer,
    )

    expect(tmpl.kind).toBe(RELAYS)
    // both was added for read then write, so it should collapse to modeless.
    expect(tmpl.tags).toContainEqual(["r", both])
    expect(tmpl.tags).toContainEqual(["r", readUrl, "read"])
    expect(tmpl.tags).toContainEqual(["r", writeUrl, "write"])
  })

  it("downgrades a modeless relay when one mode is removed", async () => {
    const tmpl = await buildTemplate(
      write(RelayList).addReadUrl(both).addWriteUrl(both).removeReadUrl(both),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["r", both, "write"])
    expect(tmpl.tags).not.toContainEqual(["r", both])
  })

  it("routes to both original and current relays so removed relays are notified", async () => {
    const reader = await read(
      RelayList,
      makeEvent({
        tags: [
          ["r", both],
          ["r", readUrl, "read"],
          ["r", writeUrl, "write"],
        ],
      }),
    )

    // Drop the read-only relay, then resolve the writer's publish relays.
    const writer = write(RelayList, reader, markerResolver).removeReadUrl(readUrl)
    const urls = await publishRelays(writer)

    // `readUrl` is gone from the event but still routed to (from the originals);
    // the surviving relays are routed to (from the current urls).
    expect(urls).toContain(normalizeRelayUrl(readUrl))
    expect(urls).toContain(normalizeRelayUrl(both))
    expect(urls).toContain(normalizeRelayUrl(writeUrl))
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelayList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
