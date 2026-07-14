import {describe, it, expect} from "vitest"
import {makeSecret, MESSAGING_RELAYS, NOTE, getTagValues, normalizeRelayUrl} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {MessagingRelayList} from "../src/kinds/MessagingRelayList"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const r1 = "wss://inbox.one.example/"
const r2 = "wss://inbox.two.example/"
const r3 = "wss://inbox.three.example/"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: MESSAGING_RELAYS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("MessagingRelayList", () => {
  it("reads messaging relay urls", async () => {
    const event = makeEvent({
      tags: [
        ["relay", r1],
        ["relay", r2],
        ["alt", "x"],
      ],
    })

    const list = await read(MessagingRelayList, event)

    expect(list.urls().sort()).toEqual([r1, r2].sort())
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["relay", r1],
        ["relay", r2],
        ["alt", "x"],
      ],
    })

    const list = await read(MessagingRelayList, event)
    const tmpl = await buildTemplate(write(MessagingRelayList, list), signer)

    expect(tmpl.kind).toBe(MESSAGING_RELAYS)
    expect(tmpl.tags.filter(t => t[0] === "relay").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder and normalizes urls", async () => {
    const tmpl = await buildTemplate(
      write(MessagingRelayList).addUrl("wss://inbox.one.example"),
      signer,
    )

    expect(getTagValues("relay", tmpl.tags)).toEqual([normalizeRelayUrl("wss://inbox.one.example")])
  })

  it("setRelays replaces existing relays", async () => {
    const event = makeEvent({tags: [["relay", r1]]})
    const list = await read(MessagingRelayList, event)

    const tmpl = await buildTemplate(write(MessagingRelayList, list).setUrls([r2, r3]), signer)

    expect(getTagValues("relay", tmpl.tags).sort()).toEqual([r2, r3].sort())
  })

  it("throws on the wrong kind", async () => {
    await expect(read(MessagingRelayList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
