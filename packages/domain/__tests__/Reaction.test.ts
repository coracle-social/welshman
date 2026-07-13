import {describe, it, expect} from "vitest"
import {makeSecret, REACTION, NOTE, FOLLOWS} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Reaction} from "../src/kinds/Reaction"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const targetId = "aa".repeat(32)
const targetPubkey = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: REACTION,
    tags: [],
    content: "+",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Reaction", () => {
  it("reads target references and emojis", async () => {
    const event = makeEvent({
      content: ":soapbox:",
      tags: [
        ["e", targetId, "wss://relay.example.com"],
        ["a", `3:${targetPubkey}:`],
        ["p", targetPubkey],
        ["k", "3"],
        ["emoji", "soapbox", "https://example.com/soapbox.png"],
        ["alt", "x"],
      ],
    })

    const reaction = await read(Reaction, event)

    expect(reaction.content()).toBe(":soapbox:")
    expect(reaction.eventId()).toBe(targetId)
    expect(reaction.eventAddress()).toBe(`3:${targetPubkey}:`)
    expect(reaction.pubkey()).toBe(targetPubkey)
    expect(reaction.eventKind()).toBe(3)
    expect(reaction.emojis()).toEqual([["emoji", "soapbox", "https://example.com/soapbox.png"]])
  })

  it("round-trips with no duplicate target tags", async () => {
    const event = makeEvent({
      tags: [
        ["e", targetId],
        ["p", targetPubkey],
        ["k", "1"],
        ["alt", "x"],
      ],
    })

    const target = makeEvent({id: "11".repeat(32), pubkey: targetPubkey, kind: NOTE, content: ""})

    const tmpl = await buildTemplate(write(Reaction, await read(Reaction, event)).setEvent(target), signer)

    // Each target key emits exactly once.
    for (const key of ["e", "p", "k"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["e", "11".repeat(32), ""])
    expect(tmpl.tags).toContainEqual(["p", targetPubkey, "", ""])
    expect(tmpl.tags).toContainEqual(["k", "1"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("+")
  })

  it("adds an a tag for replaceable targets", async () => {
    const target = makeEvent({id: targetId, pubkey: targetPubkey, kind: FOLLOWS, content: ""})

    const tmpl = await buildTemplate(write(Reaction).setContent("+").setEvent(target), signer)

    expect(tmpl.kind).toBe(REACTION)
    expect(tmpl.tags).toContainEqual(["e", targetId, ""])
    expect(tmpl.tags).toContainEqual(["p", targetPubkey, "", ""])
    expect(tmpl.tags).toContainEqual(["k", String(FOLLOWS)])
    expect(tmpl.tags).toContainEqual(["a", `${FOLLOWS}:${targetPubkey}:`, ""])
  })

  it("adds and removes emojis", async () => {
    const target = makeEvent({id: targetId, pubkey: targetPubkey, kind: NOTE, content: ""})

    const builder = write(Reaction)
      .setContent(":soapbox:")
      .setEvent(target)
      .addEmoji("soapbox", "https://example.com/soapbox.png")
      .addEmoji("gleasonator", "https://example.com/gleasonator.png")
      .removeEmoji("gleasonator")

    const tmpl = await buildTemplate(builder, signer)

    expect(tmpl.tags).toContainEqual(["emoji", "soapbox", "https://example.com/soapbox.png"])
    expect(tmpl.tags.filter(t => t[0] === "emoji").length).toBe(1)
  })

  it("throws without an e tag", async () => {
    await expect(buildTemplate(write(Reaction).setContent("+"), signer)).rejects.toThrow(
      "A reaction must reference an event via an e tag",
    )
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Reaction, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
