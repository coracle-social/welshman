import {describe, it, expect} from "vitest"
import {makeSecret, COMMUNITIES, NOTE, getAddressTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {GroupList, GroupListBuilder} from "../src/kinds/GroupList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const g1 = `34550:${"aa".repeat(32)}:dev`
const g2 = `34550:${"bb".repeat(32)}:art`
const g3 = `34550:${"cc".repeat(32)}:music`

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

    const list = await GroupList.fromEvent(event)

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

    const list = await GroupList.fromEvent(event)
    const tmpl = await list.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(COMMUNITIES)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder with relay hint", async () => {
    const tmpl = await new GroupListBuilder()
      .addGroup(g1, "wss://relay.example/")
      .addGroup(g2)
      .toTemplate(signer)

    expect(getAddressTagValues(tmpl.tags).sort()).toEqual([g1, g2].sort())
    expect(tmpl.tags).toContainEqual(["a", g1, "wss://relay.example/"])
    expect(tmpl.tags).toContainEqual(["a", g2, ""])
  })

  it("removeGroup removes by address", async () => {
    const event = makeEvent({tags: [["a", g1], ["a", g2]]})
    const list = await GroupList.fromEvent(event)

    const tmpl = await list.builder().removeGroup(g1).toTemplate(signer)

    expect(getAddressTagValues(tmpl.tags)).toEqual([g2])
  })

  it("round-trips public and private entries through encryption", async () => {
    const event = await new GroupListBuilder()
      .addGroup(g1)
      .addPrivate(["a", g2, ""])
      .toEvent(signer)

    expect(getAddressTagValues(event.tags)).toEqual([g1])
    expect(event.content).not.toBe("")

    const decrypted = await GroupList.fromEvent(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.addresses().sort()).toEqual([g1, g2].sort())

    const publicOnly = await GroupList.fromEvent(event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.addresses()).toEqual([g1])
  })

  it("preserves undecrypted ciphertext on pass-through", async () => {
    const event = await new GroupListBuilder().addPrivate(["a", g2, ""]).toEvent(signer)
    const undecrypted = await GroupList.fromEvent(event)

    const tmpl = await undecrypted.builder().toTemplate(signer)

    expect(tmpl.content).toBe(event.content)
  })

  it("throws on the wrong kind", async () => {
    await expect(GroupList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
