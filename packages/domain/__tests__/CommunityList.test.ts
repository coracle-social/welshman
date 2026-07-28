import {describe, it, expect} from "vitest"
import {makeSecret, COMMUNITIES, NOTE, addressTags, tagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {CommunityList} from "../src/kinds/CommunityList"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const c1 = `34550:${"aa".repeat(32)}:dev`
const c2 = `34550:${"bb".repeat(32)}:art`

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: COMMUNITIES,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("CommunityList", () => {
  it("reads community addresses", async () => {
    const event = makeEvent({
      tags: [
        ["a", c1, "wss://relay.example/"],
        ["a", c2],
        ["alt", "x"],
      ],
    })

    const list = await read(CommunityList, event)

    expect(list.addresses().sort()).toEqual([c1, c2].sort())
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["a", c1, "wss://relay.example/"],
        ["a", c2],
        ["alt", "x"],
      ],
    })

    const list = await read(CommunityList, event)
    const tmpl = await buildTemplate(write(CommunityList, list), signer)

    expect(tmpl.kind).toBe(COMMUNITIES)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder with relay hint", async () => {
    const tmpl = await buildTemplate(
      write(CommunityList).addCommunity(c1, "wss://relay.example/").addCommunity(c2),
      signer,
    )

    expect(tagValues(addressTags("a"), tmpl.tags).sort()).toEqual([c1, c2].sort())
    expect(tmpl.tags).toContainEqual(["a", c1, "wss://relay.example/"])
    expect(tmpl.tags).toContainEqual(["a", c2])
  })

  it("removeCommunity removes by address", async () => {
    const event = makeEvent({
      tags: [
        ["a", c1],
        ["a", c2],
      ],
    })
    const list = await read(CommunityList, event)

    const tmpl = await buildTemplate(write(CommunityList, list).removeCommunity(c1), signer)

    expect(tagValues(addressTags("a"), tmpl.tags)).toEqual([c2])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(CommunityList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
