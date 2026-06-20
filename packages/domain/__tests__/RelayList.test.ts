import {describe, it, expect} from "vitest"
import {makeSecret, RELAYS, NOTE, RelayMode, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayList, RelayListBuilder} from "../src/kinds/RelayList"

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
    const reader = await RelayList.fromEvent(
      makeEvent({
        tags: [
          ["r", both],
          ["r", read, RelayMode.Read],
          ["r", write, RelayMode.Write],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.urls().sort()).toEqual([both, read, write].map(normalizeRelayUrl).sort())
    expect(reader.readUrls().sort()).toEqual([both, read].map(normalizeRelayUrl).sort())
    expect(reader.writeUrls().sort()).toEqual([both, write].map(normalizeRelayUrl).sort())
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await RelayList.fromEvent(
      makeEvent({
        tags: [
          ["r", both],
          ["r", read, RelayMode.Read],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "r").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds modeless and single-mode relays via a fresh builder", async () => {
    const tmpl = await new RelayListBuilder()
      .addUrl(read, RelayMode.Read)
      .addUrl(write, RelayMode.Write)
      .addUrl(both, RelayMode.Read)
      .addUrl(both, RelayMode.Write)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(RELAYS)
    // both was added for read then write, so it should collapse to modeless.
    expect(tmpl.tags).toContainEqual(["r", both])
    expect(tmpl.tags).toContainEqual(["r", read, RelayMode.Read])
    expect(tmpl.tags).toContainEqual(["r", write, RelayMode.Write])
  })

  it("downgrades a modeless relay when one mode is removed", async () => {
    const tmpl = await new RelayListBuilder()
      .addUrl(both, RelayMode.Read)
      .addUrl(both, RelayMode.Write)
      .removeUrl(both, RelayMode.Read)
      .toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["r", both, RelayMode.Write])
    expect(tmpl.tags).not.toContainEqual(["r", both])
  })

  it("throws on the wrong kind", async () => {
    await expect(RelayList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
