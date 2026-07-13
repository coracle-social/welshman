import {describe, it, expect} from "vitest"
import {makeSecret, POLL, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Poll} from "../src/kinds/Poll"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: POLL,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Poll", () => {
  it("parses the represented tags and plain-text title", async () => {
    const event = makeEvent({
      content: "Favorite color?",
      tags: [
        ["option", "1", "Red"],
        ["option", "2", "Blue"],
        ["polltype", "multiplechoice"],
        ["endsAt", "1234"],
        ["relay", "wss://relay.one"],
        ["relay", "wss://relay.two"],
        ["alt", "x"],
      ],
    })

    const poll = await read(Poll, event)

    expect(poll.title()).toBe("Favorite color?")
    expect(poll.options()).toEqual([
      {id: "1", label: "Red"},
      {id: "2", label: "Blue"},
    ])
    expect(poll.pollType()).toBe("multiplechoice")
    expect(poll.endsAt()).toBe(1234)
    expect(poll.urls()).toEqual(["wss://relay.one", "wss://relay.two"])
  })

  it("tallies results from response events", async () => {
    const poll = await read(Poll, 
      makeEvent({
        content: "Pick one",
        tags: [
          ["option", "1", "Red"],
          ["option", "2", "Blue"],
        ],
      }),
    )

    const responses = [
      {pubkey: "a", created_at: 1, tags: [["response", "1"]]},
      {pubkey: "b", created_at: 1, tags: [["response", "2"]]},
      // Latest response per pubkey wins.
      {pubkey: "a", created_at: 2, tags: [["response", "2"]]},
    ] as TrustedEvent[]

    const result = poll.results(responses)

    expect(result.voters).toBe(2)
    expect(result.options.find(o => o.id === "1")!.votes).toBe(0)
    expect(result.options.find(o => o.id === "2")!.votes).toBe(2)
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      content: "Favorite color?",
      tags: [
        ["option", "1", "Red"],
        ["option", "2", "Blue"],
        ["polltype", "multiplechoice"],
        ["endsAt", "1234"],
        ["relay", "wss://relay.one"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Poll, await read(Poll, event)), signer)

    expect(tmpl.content).toBe("Favorite color?")
    expect(tmpl.tags.filter(t => t[0] === "option").length).toBe(2)
    expect(tmpl.tags.filter(t => t[0] === "polltype").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "endsAt").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "relay").length).toBe(1)
    // Unknown tag survives the round-trip.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(write(Poll)
      .setTitle("Q?")
      .addOption("Red", "1")
      .addOption("Blue", "2")
      .setPollType("multiplechoice")
      .setEndsAt(9999)
      .setUrls(["wss://relay.one"]), signer)

    expect(tmpl.kind).toBe(POLL)
    expect(tmpl.content).toBe("Q?")
    expect(tmpl.tags).toContainEqual(["option", "1", "Red"])
    expect(tmpl.tags).toContainEqual(["polltype", "multiplechoice"])
    expect(tmpl.tags).toContainEqual(["endsAt", "9999"])
    expect(tmpl.tags).toContainEqual(["relay", "wss://relay.one"])
  })

  it("requires at least one option", async () => {
    await expect(buildTemplate(write(Poll).setTitle("Q?"), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Poll, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
