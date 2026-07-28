import {describe, it, expect} from "vitest"
import {makeSecret, ZAP_GOAL, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {ZapGoal} from "../src/kinds/ZapGoal"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ZAP_GOAL,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("ZapGoal", () => {
  it("parses the represented tags and plain-text title", async () => {
    const event = makeEvent({
      content: "New server fund",
      tags: [
        ["summary", "help us buy a server"],
        ["image", "https://example.com/goal.png"],
        ["amount", "500000"],
        ["closed_at", "1700000000"],
        ["relays", "wss://relay.one", "wss://relay.two"],
        ["alt", "x"],
      ],
    })

    const goal = await read(ZapGoal, event)

    expect(goal.title()).toBe("New server fund")
    expect(goal.summary()).toBe("help us buy a server")
    expect(goal.image()).toBe("https://example.com/goal.png")
    expect(goal.amount()).toBe(500000)
    expect(goal.closedAt()).toBe(1700000000)
    expect(goal.urls()).toEqual(["wss://relay.one", "wss://relay.two"])
  })

  it("tolerates relays split across several tags", async () => {
    const goal = await read(
      ZapGoal,
      makeEvent({
        content: "Goal",
        tags: [
          ["relays", "wss://relay.one"],
          ["relays", "wss://relay.two", "wss://relay.one"],
        ],
      }),
    )

    expect(goal.urls()).toEqual(["wss://relay.one", "wss://relay.two"])
  })

  it("leaves closed_at and image undefined when absent or unparseable", async () => {
    const goal = await read(ZapGoal, makeEvent({content: "Goal", tags: [["closed_at", "soon"]]}))

    expect(goal.closedAt()).toBeUndefined()
    expect(goal.image()).toBeUndefined()
  })

  it("defaults amount to 0 when missing or unparseable", async () => {
    const goal = await read(ZapGoal, makeEvent({content: "Goal"}))

    expect(goal.amount()).toBe(0)
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      content: "New server fund",
      tags: [
        ["summary", "help us buy a server"],
        ["amount", "500000"],
        ["relays", "wss://relay.one"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(ZapGoal, await read(ZapGoal, event)), signer)

    expect(tmpl.content).toBe("New server fund")
    expect(tmpl.tags.filter(t => t[0] === "summary").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "amount").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "relays").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(ZapGoal)
        .setTitle("Goal")
        .setSummary("a summary")
        .setAmount(1000)
        .setImage("https://example.com/goal.png")
        .setClosedAt(1700000000)
        .setUrls(["wss://relay.one", "wss://relay.two"]),
      signer,
    )

    expect(tmpl.kind).toBe(ZAP_GOAL)
    expect(tmpl.content).toBe("Goal")
    expect(tmpl.tags).toContainEqual(["summary", "a summary"])
    expect(tmpl.tags).toContainEqual(["amount", "1000"])
    expect(tmpl.tags).toContainEqual(["image", "https://example.com/goal.png"])
    expect(tmpl.tags).toContainEqual(["closed_at", "1700000000"])
    // NIP-75 expects one relays tag holding every url
    expect(tmpl.tags).toContainEqual(["relays", "wss://relay.one", "wss://relay.two"])
  })

  it("requires at least one relay", async () => {
    await expect(
      buildTemplate(write(ZapGoal).setTitle("Goal").setUrls([]), signer),
    ).rejects.toThrow()
  })

  it("requires a title", async () => {
    await expect(
      buildTemplate(write(ZapGoal).setAmount(1000).setUrls(["wss://relay.one"]), signer),
    ).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(ZapGoal, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
