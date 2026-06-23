import {describe, it, expect} from "vitest"
import {makeSecret, SEARCH_RELAYS, NOTE, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {SearchRelayList, SearchRelayListBuilder} from "../src/kinds/SearchRelayList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const relayA = "wss://search-a.example.com/"
const relayB = "wss://search-b.example.com/"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: SEARCH_RELAYS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("SearchRelayList", () => {
  it("reads search relay urls", async () => {
    const reader = await SearchRelayList.fromEvent(
      makeEvent({
        tags: [
          ["relay", relayA],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.urls()).toEqual([normalizeRelayUrl(relayA)])
    expect(reader.includes(relayA)).toBe(true)
    expect(reader.includes(relayB)).toBe(false)
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await SearchRelayList.fromEvent(
      makeEvent({
        tags: [
          ["relay", relayA],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "relay").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds and removes relays via a fresh builder", async () => {
    const tmpl = await new SearchRelayListBuilder()
      .addUrl(relayA)
      .addUrl(relayB)
      .removeUrl(relayA)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(SEARCH_RELAYS)
    expect(tmpl.tags).toContainEqual(["relay", normalizeRelayUrl(relayB)])
    expect(tmpl.tags.some(t => t[1] === normalizeRelayUrl(relayA))).toBe(false)
  })

  it("throws on the wrong kind", async () => {
    await expect(SearchRelayList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
