import {describe, it, expect} from "vitest"
import {makeSecret, FEEDS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {FeedList} from "../src/kinds/FeedList"
import {buildTemplate, buildEvent, read, write} from "./helpers.js"

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
    const reader = await read(
      FeedList,
      makeEvent({
        tags: [
          ["a", addressA],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.addresses()).toEqual([addressA])
    expect(reader.includes(addressA)).toBe(true)
    expect(reader.includes(addressB)).toBe(false)
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await read(
      FeedList,
      makeEvent({
        tags: [
          ["a", addressA],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(FeedList, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("adds and removes feeds via a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(FeedList)
        .addFeed(addressA, "wss://relay.example.com/")
        .addFeed(addressB)
        .removeFeed(addressA),
      signer,
    )

    expect(tmpl.kind).toBe(FEEDS)
    expect(tmpl.tags).toContainEqual(["a", addressB, ""])
    expect(tmpl.tags.some(t => t[1] === addressA)).toBe(false)
  })

  it("round-trips public and private feeds through encryption", async () => {
    const event = await buildEvent(
      write(FeedList).addFeed(addressA).addFeedPrivately(addressB),
      signer,
    )

    const decrypted = await read(FeedList, event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.addresses().sort()).toEqual([addressA, addressB].sort())

    const publicOnly = await read(FeedList, event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.addresses()).toEqual([addressA])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(FeedList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
