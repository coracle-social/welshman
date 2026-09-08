import {describe, it, expect} from "vitest"
import {makeSecret, LABEL, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Label} from "../src/kinds/Label"
import {
  buildTemplate,
  read,
  write,
  publishRelays,
  markerResolver,
  OUTBOX,
  INBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const targetId = "aa".repeat(32)
const targetPubkey = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: LABEL,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Label", () => {
  it("reads namespaces, labels and subjects", async () => {
    const event = makeEvent({
      tags: [
        ["L", "#t"],
        ["l", "nostr", "#t"],
        ["l", "bitcoin", "#t"],
        ["L", "quality"],
        ["l", "good", "quality"],
        ["e", targetId],
        ["p", targetPubkey],
        ["a", `${NOTE}:${targetPubkey}:slug`],
        ["t", "#nostr"],
        ["r", "wss://relay.example.com/"],
      ],
    })

    const label = await read(Label, event)

    expect(label.namespaces()).toEqual(["#t", "quality"])
    expect(label.labels()).toEqual(["nostr", "bitcoin", "good"])
    expect(label.labels("#t")).toEqual(["nostr", "bitcoin"])
    expect(label.labels("quality")).toEqual(["good"])
    expect(label.eventIds()).toEqual([targetId])
    expect(label.pubkeys()).toEqual([targetPubkey])
    expect(label.addresses()).toEqual([`${NOTE}:${targetPubkey}:slug`])
    // topicTags strips the leading hash.
    expect(label.topics()).toEqual(["nostr"])
    expect(label.urls()).toEqual(["wss://relay.example.com/"])
  })

  it("declares a namespace once per label", async () => {
    const tmpl = await buildTemplate(
      write(Label).addEventId(targetId).addLabel("nostr", "#t").addLabel("bitcoin", "#t"),
      signer,
    )

    expect(tmpl.kind).toBe(LABEL)
    expect(tmpl.tags).toContainEqual(["e", targetId])
    expect(tmpl.tags).toContainEqual(["l", "nostr", "#t"])
    expect(tmpl.tags).toContainEqual(["l", "bitcoin", "#t"])
    expect(tmpl.tags.filter(t => t[0] === "L")).toEqual([["L", "#t"]])
  })

  it("does not duplicate a label added twice", async () => {
    const tmpl = await buildTemplate(
      write(Label).addEventId(targetId).addLabel("nostr", "#t").addLabel("nostr", "#t"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "l").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "L").length).toBe(1)
  })

  it("drops the namespace with its last label", async () => {
    const builder = write(Label)
      .addEventId(targetId)
      .addLabel("nostr", "#t")
      .addLabel("bitcoin", "#t")
      .addLabel("good", "quality")
      .removeLabel("nostr", "#t")

    const tmpl = await buildTemplate(builder, signer)

    // "#t" still has bitcoin, so its declaration stays.
    expect(tmpl.tags).toContainEqual(["L", "#t"])
    expect(tmpl.tags).not.toContainEqual(["l", "nostr", "#t"])

    const emptied = await buildTemplate(builder.removeLabel("bitcoin", "#t"), signer)

    expect(emptied.tags).not.toContainEqual(["L", "#t"])
    // The untouched namespace is unaffected.
    expect(emptied.tags).toContainEqual(["L", "quality"])
    expect(emptied.tags).toContainEqual(["l", "good", "quality"])
  })

  it("labels every subject type", async () => {
    const tmpl = await buildTemplate(
      write(Label)
        .addLabel("good", "quality")
        .addEventId(targetId)
        .addPubkey(targetPubkey)
        .addAddress(`${NOTE}:${targetPubkey}:slug`)
        .addTopic("nostr")
        .addUrl("wss://relay.example.com/"),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["e", targetId])
    expect(tmpl.tags).toContainEqual(["p", targetPubkey])
    expect(tmpl.tags).toContainEqual(["a", `${NOTE}:${targetPubkey}:slug`])
    expect(tmpl.tags).toContainEqual(["t", "nostr"])
    expect(tmpl.tags).toContainEqual(["r", "wss://relay.example.com/"])
  })

  it("round-trips unknown tags", async () => {
    const event = makeEvent({
      tags: [
        ["L", "#t"],
        ["l", "nostr", "#t"],
        ["e", targetId],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Label, await read(Label, event)), signer)

    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.tags).toContainEqual(["l", "nostr", "#t"])
  })

  // A label is an assertion about its subject, not a message to them, so the
  // p tag must not pull in the subject's inbox.
  it("publishes only to the user's outbox", async () => {
    const relays = await publishRelays(
      write(Label, undefined, markerResolver).addLabel("good", "quality").addPubkey(targetPubkey),
    )

    expect(relays).toEqual([OUTBOX])
    expect(relays).not.toContain(INBOX)
  })

  it("throws without an l tag", async () => {
    await expect(buildTemplate(write(Label).addEventId(targetId), signer)).rejects.toThrow(
      "A label must carry at least one l tag",
    )
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Label, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
