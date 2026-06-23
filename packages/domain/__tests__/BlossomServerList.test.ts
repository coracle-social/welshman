import {describe, it, expect} from "vitest"
import {makeSecret, BLOSSOM_SERVERS, NOTE, getTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {normalizeUrl} from "@welshman/lib"
import {Nip01Signer} from "@welshman/signer"
import {BlossomServerList, BlossomServerListBuilder} from "../src/kinds/BlossomServerList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const s1 = "https://blossom.one.example/"
const s2 = "https://blossom.two.example/"
const s3 = "https://blossom.three.example/"

const norm = (url: string) => normalizeUrl(url)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BLOSSOM_SERVERS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("BlossomServerList", () => {
  it("reads server urls from server tags", async () => {
    const event = makeEvent({
      tags: [
        ["server", s1],
        ["server", s2],
        ["alt", "x"],
      ],
    })

    const list = await BlossomServerList.fromEvent(event)

    expect(list.urls().sort()).toEqual([norm(s1), norm(s2)].sort())
    expect(list.includes(s1)).toBe(true)
    expect(list.includes(s3)).toBe(false)
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["server", s1],
        ["server", s2],
        ["alt", "x"],
      ],
    })

    const list = await BlossomServerList.fromEvent(event)
    const tmpl = await list.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(BLOSSOM_SERVERS)
    expect(tmpl.tags.filter(t => t[0] === "server").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder and normalizes urls", async () => {
    const tmpl = await new BlossomServerListBuilder().addUrl(s1).toTemplate(signer)

    expect(getTagValues("server", tmpl.tags)).toEqual([norm(s1)])
  })

  it("setServers replaces existing servers", async () => {
    const event = makeEvent({tags: [["server", s1]]})
    const list = await BlossomServerList.fromEvent(event)

    const tmpl = await list.builder().setUrls([s2, s3]).toTemplate(signer)

    expect(getTagValues("server", tmpl.tags).sort()).toEqual([norm(s2), norm(s3)].sort())
  })

  it("throws on the wrong kind", async () => {
    await expect(BlossomServerList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
