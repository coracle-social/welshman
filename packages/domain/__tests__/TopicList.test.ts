import {describe, it, expect} from "vitest"
import {makeSecret, TOPICS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {TopicList} from "../src/kinds/TopicList"
import {buildTemplate, buildEvent, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const topicA = "nostr"
const topicB = "bitcoin"
const address = `30015:${"22".repeat(32)}:interests`

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: TOPICS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("TopicList", () => {
  it("reads followed topics and interest-set addresses", async () => {
    const reader = await read(TopicList, 
      makeEvent({
        tags: [
          ["t", topicA],
          ["a", address],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.topics()).toEqual([topicA])
    expect(reader.addresses()).toEqual([address])
    expect(reader.includes(topicA)).toBe(true)
    expect(reader.includes(topicB)).toBe(false)
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await read(TopicList, 
      makeEvent({
        tags: [
          ["t", topicA],
          ["a", address],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(TopicList, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "t").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("follows and unfollows via a fresh builder", async () => {
    const tmpl = await buildTemplate(write(TopicList)
      .follow(topicA)
      .follow(topicB)
      .unfollow(topicA), signer)

    expect(tmpl.kind).toBe(TOPICS)
    expect(tmpl.tags).toContainEqual(["t", topicB])
    expect(tmpl.tags.some(t => t[1] === topicA)).toBe(false)
  })

  it("round-trips public and private topics through encryption", async () => {
    const event = await buildEvent(write(TopicList)
      .followPublicly(topicA)
      .followPrivately(topicB), signer)

    const decrypted = await read(TopicList, event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.topics().sort()).toEqual([topicA, topicB].sort())

    const publicOnly = await read(TopicList, event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.topics()).toEqual([topicA])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(TopicList, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
