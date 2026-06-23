import {describe, it, expect} from "vitest"
import {makeSecret, FOLLOWS, NOTE, getPubkeyTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {FollowList, FollowListBuilder} from "../src/kinds/FollowList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: FOLLOWS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("FollowList", () => {
  it("reads followed pubkeys", async () => {
    const event = makeEvent({
      tags: [
        ["p", a],
        ["p", b],
        ["t", "nostr"],
        ["alt", "x"],
      ],
    })

    const list = await FollowList.fromEvent(event)

    expect(list.pubkeys().sort()).toEqual([a, b].sort())
    expect(list.includes(a)).toBe(true)
    expect(list.includes(c)).toBe(false)
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["p", a],
        ["p", b],
        ["alt", "x"],
      ],
    })

    const list = await FollowList.fromEvent(event)
    const tmpl = await list.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(FOLLOWS)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder via follow", async () => {
    const tmpl = await new FollowListBuilder()
      .follow(a)
      .follow(b, "wss://relay.example/", "alice")
      .toTemplate(signer)

    expect(getPubkeyTagValues(tmpl.tags).sort()).toEqual([a, b].sort())
    expect(tmpl.tags).toContainEqual(["p", b, "wss://relay.example/", "alice"])
  })

  it("unfollow removes by value", async () => {
    const event = makeEvent({
      tags: [
        ["p", a],
        ["p", b],
      ],
    })
    const list = await FollowList.fromEvent(event)

    const tmpl = await list.builder().unfollow(a).toTemplate(signer)

    expect(getPubkeyTagValues(tmpl.tags)).toEqual([b])
  })

  it("throws on the wrong kind", async () => {
    await expect(FollowList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
