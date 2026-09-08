import {describe, it, expect} from "vitest"
import {makeSecret, REPOST, GENERIC_REPOST, NOTE, FOLLOWS, LONG_FORM} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Repost, GenericRepost} from "../src/kinds/Repost"
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
    kind: REPOST,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const target = makeEvent({id: targetId, pubkey: targetPubkey, kind: NOTE, content: "hi"})

describe("Repost", () => {
  it("reads target references", async () => {
    const event = makeEvent({
      content: JSON.stringify(target),
      tags: [
        ["e", targetId, "wss://relay.example.com"],
        ["p", targetPubkey],
        ["alt", "x"],
      ],
    })

    const repost = await read(Repost, event)

    expect(repost.eventId()).toBe(targetId)
    expect(repost.pubkey()).toBe(targetPubkey)
    expect(repost.repostedEvent()?.id).toBe(targetId)
  })

  // Kind 6 is defined as a note repost, so the kind is implicit rather than tagged.
  it("infers the reposted kind for kind 6 and reads the k tag for kind 16", async () => {
    const plain = await read(Repost, makeEvent({tags: [["e", targetId]]}))

    expect(plain.eventKind()).toBe(NOTE)

    const generic = await read(
      GenericRepost,
      makeEvent({
        kind: GENERIC_REPOST,
        tags: [
          ["e", targetId],
          ["k", String(LONG_FORM)],
        ],
      }),
    )

    expect(generic.eventKind()).toBe(LONG_FORM)
  })

  it("returns undefined for malformed content", async () => {
    const repost = await read(Repost, makeEvent({content: "not json", tags: [["e", targetId]]}))

    expect(repost.repostedEvent()).toBeUndefined()
  })

  it("embeds the event and tags its author", async () => {
    const tmpl = await buildTemplate(write(Repost).setEvent(target), signer)

    expect(tmpl.kind).toBe(REPOST)
    expect(tmpl.content).toBe(JSON.stringify(target))
    expect(tmpl.tags).toContainEqual(["e", targetId, ""])
    expect(tmpl.tags).toContainEqual(["p", targetPubkey, ""])
    // Kind 6 carries no k tag.
    expect(tmpl.tags.filter(t => t[0] === "k")).toEqual([])
  })

  it("adds a k tag for generic reposts", async () => {
    const article = makeEvent({id: targetId, pubkey: targetPubkey, kind: LONG_FORM, content: ""})
    const tmpl = await buildTemplate(write(GenericRepost).setEvent(article), signer)

    expect(tmpl.kind).toBe(GENERIC_REPOST)
    expect(tmpl.tags).toContainEqual(["k", String(LONG_FORM)])
  })

  it("adds an a tag for replaceable targets", async () => {
    const list = makeEvent({id: targetId, pubkey: targetPubkey, kind: FOLLOWS, content: ""})
    const tmpl = await buildTemplate(write(GenericRepost).setEvent(list), signer)

    expect(tmpl.tags).toContainEqual(["a", `${FOLLOWS}:${targetPubkey}:`, ""])
  })

  it("round-trips with no duplicate target tags", async () => {
    const event = makeEvent({
      tags: [
        ["e", "11".repeat(32)],
        ["p", "22".repeat(32)],
        ["k", "1"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(
      write(Repost, await read(Repost, event)).setEvent(target),
      signer,
    )

    for (const key of ["e", "p"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["e", targetId, ""])
    // The stale k tag from the seed event is dropped along with the other targets.
    expect(tmpl.tags.filter(t => t[0] === "k")).toEqual([])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("resolves relay hints into the target tags", async () => {
    const tmpl = await buildTemplate(
      write(Repost, undefined, markerResolver).setEvent(target),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["e", targetId, "wss://pubkey-outbox.test/"])
    expect(tmpl.tags).toContainEqual(["p", targetPubkey, "wss://pubkey-outbox.test/"])
  })

  // The default routing: the author's outbox plus the mentioned author's inbox.
  it("publishes to the user's outbox and the reposted author's inbox", async () => {
    const relays = await publishRelays(write(Repost, undefined, markerResolver).setEvent(target))

    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("throws without an e tag", async () => {
    await expect(buildTemplate(write(Repost), signer)).rejects.toThrow(
      "A repost must reference an event via an e tag",
    )
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Repost, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
