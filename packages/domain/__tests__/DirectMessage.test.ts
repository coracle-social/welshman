import {describe, it, expect} from "vitest"
import {makeSecret, DIRECT_MESSAGE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {DirectMessage} from "../src/kinds/DirectMessage"
import {
  buildTemplate,
  markerResolver,
  publishRelays,
  read,
  write,
  MESSAGING,
  USER_MESSAGING,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const recipient = "aa".repeat(32)
const other = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: DIRECT_MESSAGE,
    tags: [],
    content: "gm",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("DirectMessage", () => {
  it("reads recipients, subject, and parent", async () => {
    const event = makeEvent({
      tags: [
        ["p", recipient, "wss://inbox.example.com"],
        ["p", other],
        ["e", "11".repeat(32), "wss://inbox.example.com", "reply"],
        ["subject", "welshman"],
      ],
    })

    const message = await read(DirectMessage, event)

    expect(message.content()).toBe("gm")
    expect(message.recipients()).toEqual([recipient, other])
    expect(message.subject()).toBe("welshman")
    expect(message.parentId()).toBe("11".repeat(32))
  })

  it("writes recipients, subject, and a reply, hinting at messaging relays", async () => {
    const parent = makeEvent({id: "11".repeat(32), pubkey: recipient})

    const tmpl = await buildTemplate(
      write(DirectMessage, undefined, markerResolver)
        .setContent("gm")
        .addRecipient(recipient)
        .addRecipient(other)
        .removeRecipient(other)
        .setSubject("welshman")
        .setParent(parent),
      signer,
    )

    expect(tmpl.kind).toBe(DIRECT_MESSAGE)
    expect(tmpl.content).toBe("gm")
    expect(tmpl.tags).toContainEqual(["p", recipient, MESSAGING])
    expect(tmpl.tags.filter(t => t[0] === "p")).toHaveLength(1)
    expect(tmpl.tags).toContainEqual(["subject", "welshman"])
    expect(tmpl.tags).toContainEqual(["e", parent.id, MESSAGING, "reply"])
  })

  it("replaces the parent rather than adding a second one", async () => {
    const first = makeEvent({id: "11".repeat(32), pubkey: recipient})
    const second = makeEvent({id: "22".repeat(32), pubkey: recipient})

    const tmpl = await buildTemplate(
      write(DirectMessage).addRecipient(recipient).setParent(first).setParent(second),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "e")).toEqual([["e", second.id, "", "reply"]])
  })

  it("routes to the messaging relays of both parties", async () => {
    const relays = await publishRelays(
      write(DirectMessage, undefined, markerResolver).addRecipient(recipient),
    )

    expect(relays).toContain(USER_MESSAGING)
    expect(relays).toContain(MESSAGING)
  })

  it("throws without a recipient", async () => {
    await expect(buildTemplate(write(DirectMessage).setContent("gm"), signer)).rejects.toThrow(
      "A direct message must have at least one recipient",
    )
  })

  it("throws on the wrong kind", async () => {
    await expect(read(DirectMessage, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
