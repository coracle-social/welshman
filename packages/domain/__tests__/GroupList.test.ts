import {describe, it, expect} from "vitest"
import {makeSecret, COMMUNITIES, NOTE, getAddressTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {GroupList} from "../src/kinds/GroupList"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const g1 = `34550:${"aa".repeat(32)}:dev`
const g2 = `34550:${"bb".repeat(32)}:art`

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

describe("GroupList", () => {
  it("reads community addresses", async () => {
    const event = makeEvent({
      tags: [
        ["a", g1, "wss://relay.example/"],
        ["a", g2],
        ["alt", "x"],
      ],
    })

    const list = await read(GroupList, event)

    expect(list.addresses().sort()).toEqual([g1, g2].sort())
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["a", g1, "wss://relay.example/"],
        ["a", g2],
        ["alt", "x"],
      ],
    })

    const list = await read(GroupList, event)
    const tmpl = await buildTemplate(write(GroupList, list), signer)

    expect(tmpl.kind).toBe(COMMUNITIES)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder with relay hint", async () => {
    const tmpl = await buildTemplate(
      write(GroupList).addGroup(g1, "wss://relay.example/").addGroup(g2),
      signer,
    )

    expect(getAddressTagValues(tmpl.tags).sort()).toEqual([g1, g2].sort())
    expect(tmpl.tags).toContainEqual(["a", g1, "wss://relay.example/"])
    expect(tmpl.tags).toContainEqual(["a", g2])
  })

  it("removeGroup removes by address", async () => {
    const event = makeEvent({
      tags: [
        ["a", g1],
        ["a", g2],
      ],
    })
    const list = await read(GroupList, event)

    const tmpl = await buildTemplate(write(GroupList, list).removeGroup(g1), signer)

    expect(getAddressTagValues(tmpl.tags)).toEqual([g2])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(GroupList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
