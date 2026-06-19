import {describe, it, expect} from "vitest"
import {makeSecret, FEEDS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {FeedList, FeedListBuilder} from "../src/kinds/FeedList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const addressA = `31890:${"22".repeat(32)}:feeda`
const addressB = `31890:${"33".repeat(32)}:feedb`

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: FEEDS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("FeedList", () => {
  it("reads saved feed addresses", async () => {
    const reader = await FeedList.fromEvent(
      makeEvent({tags: [["a", addressA], ["alt", "x"]]}),
    )

    expect(reader.addresses()).toEqual([addressA])
    expect(reader.includes(addressA)).toBe(true)
    expect(reader.includes(addressB)).toBe(false)
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await FeedList.fromEvent(
      makeEvent({tags: [["a", addressA], ["alt", "x"]]}),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds and removes feeds via a fresh builder", async () => {
    const tmpl = await new FeedListBuilder()
      .addFeed(addressA, "wss://relay.example.com/")
      .addFeed(addressB)
      .removeFeed(addressA)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(FEEDS)
    expect(tmpl.tags).toContainEqual(["a", addressB, ""])
    expect(tmpl.tags.some(t => t[1] === addressA)).toBe(false)
  })

  it("round-trips public and private feeds through encryption", async () => {
    const event = await new FeedListBuilder()
      .addFeed(addressA)
      .addFeedPrivately(addressB)
      .toEvent(signer)

    const decrypted = await FeedList.fromEvent(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.addresses().sort()).toEqual([addressA, addressB].sort())

    const publicOnly = await FeedList.fromEvent(event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.addresses()).toEqual([addressA])
  })

  it("throws on the wrong kind", async () => {
    await expect(FeedList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
