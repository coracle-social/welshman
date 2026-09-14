import {describe, it, expect} from "vitest"
import {makeSecret, Address, LONG_FORM, MESSAGE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {decode, naddrEncode, neventEncode, noteEncode} from "nostr-tools/nip19"
import {Nip01Signer} from "@welshman/signer"
import {Message, getContentQuote} from "../src/kinds/Message"
import {
  buildTemplate,
  publishRelays,
  read,
  write,
  query,
  queryRelays,
  markerResolver,
  PUBKEY_OUTBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const parentId = "cc".repeat(32)
const parentPubkey = "dd".repeat(32)
const quotedId = "ab".repeat(32)
const ROOM_RELAY = "wss://room.example.com/"
const PARENT_RELAY = "wss://parent.example.com/"

const nevent = neventEncode({id: parentId, relays: [PARENT_RELAY], author: parentPubkey})
const rendered = neventEncode({id: parentId, author: parentPubkey})

// A replaceable parent is quoted by address rather than id.
const article = {kind: LONG_FORM, pubkey: parentPubkey, identifier: "x"}
const address = new Address(article.kind, article.pubkey, article.identifier).toString()
const naddr = naddrEncode({...article, relays: [PARENT_RELAY]})
const renderedNaddr = naddrEncode({...article, relays: []})

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: MESSAGE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("getContentQuote", () => {
  it("reads an nevent or note from the content's first line", () => {
    expect(getContentQuote(`nostr:${nevent}\nyes`)).toEqual({
      value: parentId,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })

    expect(getContentQuote(`nostr:${noteEncode(parentId)}\nyes`)).toEqual({value: parentId})
  })

  it("reads every reference form a client might write", () => {
    const expected = {value: parentId, relay: PARENT_RELAY, pubkey: parentPubkey}

    expect(getContentQuote(`NOSTR:${nevent}\nyes`)).toEqual(expected)
    expect(getContentQuote(`web+nostr:${nevent}\nyes`)).toEqual(expected)
    expect(getContentQuote(`nostr:${nevent}\r\nyes`)).toEqual(expected)
    // A quote and nothing else, with or without the trailing blank line.
    expect(getContentQuote(`nostr:${nevent}`)).toEqual(expected)
    expect(getContentQuote(`nostr:${nevent}\n\n`)).toEqual(expected)
  })

  it("reads an naddr, which names an address rather than an id", () => {
    expect(getContentQuote(`nostr:${naddr}\n\nyes`)).toEqual({
      value: address,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })
  })

  it("reads a reference written without the nostr: prefix", () => {
    expect(getContentQuote(`${nevent}\nyes`)).toEqual({
      value: parentId,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })

    expect(getContentQuote(`${noteEncode(parentId)}\nyes`)).toEqual({value: parentId})
  })

  it("ignores content that doesn't open with an event reference", () => {
    expect(getContentQuote("GM")).toBeUndefined()
    expect(getContentQuote("hello\nworld")).toBeUndefined()
    expect(getContentQuote(`yes\nnostr:${nevent}`)).toBeUndefined()
    expect(getContentQuote(`${nevent}yes`)).toBeUndefined()
    expect(getContentQuote("nostr:nevent1notbech32\nyes")).toBeUndefined()
    expect(getContentQuote(`nostr:${"npub1".padEnd(20, "q")}\nyes`)).toBeUndefined()
  })
})

describe("Message", () => {
  it("reads content with no reply tags", async () => {
    const message = await read(Message, makeEvent({content: "GM"}))

    expect(message.content()).toBe("GM")
    expect(message.parent()).toBeUndefined()
    expect(message.quotes()).toEqual([])
  })

  it("reads the parent the content names, and every quote", async () => {
    const event = makeEvent({
      content: `nostr:${nevent}\nyes`,
      tags: [
        ["q", parentId, PARENT_RELAY, parentPubkey],
        ["q", quotedId, "", pubkey],
      ],
    })

    const message = await read(Message, event)

    expect(message.parent()).toEqual({value: parentId, relay: PARENT_RELAY, pubkey: parentPubkey})
    expect(message.quotes()).toEqual([
      {value: parentId, relay: PARENT_RELAY, pubkey: parentPubkey},
      {value: quotedId, relay: undefined, pubkey},
    ])
  })

  // Sharing an event and replying to a message at once tags the shared event
  // first, so tag order names the wrong one.
  it("reads the parent past a quote tagged ahead of it", async () => {
    const event = makeEvent({
      content: `nostr:${nevent}\nyes`,
      tags: [
        ["q", quotedId, "", pubkey],
        ["q", parentId, PARENT_RELAY, parentPubkey],
      ],
    })

    expect((await read(Message, event)).parent()).toEqual({
      value: parentId,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })
  })

  it("has no parent when the content quotes nothing, whatever it tags", async () => {
    const event = makeEvent({
      content: `yes, see nostr:${nevent}`,
      tags: [["q", parentId, PARENT_RELAY, parentPubkey]],
    })

    const message = await read(Message, event)

    expect(message.parent()).toBeUndefined()
    expect(message.quotes()).toEqual([{value: parentId, relay: PARENT_RELAY, pubkey: parentPubkey}])
  })

  // A client that quotes in the content without tagging it still replies to
  // something, and the reference carries its own hint.
  it("falls back to the content reference when nothing tags it", async () => {
    const event = makeEvent({content: `nostr:${nevent}\nyes`})

    expect((await read(Message, event)).parent()).toEqual({
      value: parentId,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })
  })

  // The reference an event arrives with becomes the writer's parent; `content` is
  // left holding the body, and rendering puts the reference back — without the
  // relay, which is assumed to be the one hosting the chat.
  it("takes the reference off the content it edits", async () => {
    const event = makeEvent({
      content: `nostr:${nevent}\n\nyes`,
      tags: [["q", parentId, PARENT_RELAY, parentPubkey]],
    })

    const writer = write(Message, await read(Message, event)).setRoom(ROOM_RELAY, "general")

    expect(writer.content).toBe("yes")
    expect(writer.parentQuote).toEqual({value: parentId, relay: PARENT_RELAY, pubkey: parentPubkey})

    const tmpl = await buildTemplate(writer, signer)

    expect(tmpl.kind).toBe(MESSAGE)
    expect(tmpl.content).toBe(`nostr:${rendered}\n\nyes`)
    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([
      ["q", parentId, PARENT_RELAY, parentPubkey],
    ])
    expect(tmpl.tags).toContainEqual(["h", "general"])
  })

  // A note1 names nothing but an id, and there is no hint to fill in for it.
  it("tags a bare note reference with the id alone", async () => {
    const event = makeEvent({content: `nostr:${noteEncode(parentId)}\nyes`})

    const tmpl = await buildTemplate(
      write(Message, await read(Message, event)).setRoom(ROOM_RELAY, "general"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([["q", parentId]])
  })

  it("tags nothing when the content doesn't quote a message", async () => {
    const tmpl = await buildTemplate(
      write(Message).setContent("GM").setRoom(ROOM_RELAY, "general"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([])
  })

  it("round-trips without duplicating the quote tag", async () => {
    const event = makeEvent({
      content: `nostr:${nevent}\n\nyes`,
      tags: [
        ["q", parentId, PARENT_RELAY, parentPubkey],
        ["q", quotedId, "", pubkey],
        ["h", "general"],
        ["alt", "x"],
      ],
    })

    const writer = write(Message, await read(Message, event)).setRoom(ROOM_RELAY, "general")
    const tmpl = await buildTemplate(writer, signer)

    // The tags the event arrived with are what render, neither dropped nor doubled.
    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([
      ["q", parentId, PARENT_RELAY, parentPubkey],
      ["q", quotedId, "", pubkey],
    ])
    expect(tmpl.tags.filter(t => t[0] === "h")).toEqual([["h", "general"]])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe(`nostr:${rendered}\n\nyes`)
  })

  it("stops replying when the parent is cleared", async () => {
    const event = makeEvent({
      content: `nostr:${nevent}\n\nyes`,
      tags: [["q", parentId, PARENT_RELAY, parentPubkey]],
    })

    const writer = write(Message, await read(Message, event))
      .clearParent()
      .setRoom(ROOM_RELAY, "general")

    const tmpl = await buildTemplate(writer, signer)

    expect(tmpl.content).toBe("yes")
    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([])
  })

  it("replies to an event, tagging and mentioning its author", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})

    const tmpl = await buildTemplate(
      write(Message, undefined, markerResolver)
        .setContent("yes")
        .setParent(parent)
        .setRoom(ROOM_RELAY, "general"),
      signer,
    )

    // The q tag names the author the reference alone can't supply, and the p tag
    // is what a mention feed filters on.
    expect(tmpl.tags).toContainEqual(["q", parentId, "", parentPubkey])
    expect(tmpl.tags).toContainEqual(["p", parentPubkey, PUBKEY_OUTBOX])

    const [uri, blank, body] = tmpl.content.split("\n")

    expect(decode(uri.replace("nostr:", ""))).toEqual({
      type: "nevent",
      data: {id: parentId, author: parentPubkey, relays: []},
    })
    expect(blank).toBe("")
    expect(body).toBe("yes")
  })

  it("replies the same way whatever order it's built in", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})

    const build = (writer: ReturnType<typeof write<any, any, any>>) => buildTemplate(writer, signer)

    const before = await build(
      write(Message, undefined, markerResolver)
        .setParent(parent)
        .setRoom(ROOM_RELAY, "general")
        .setContent("yes"),
    )

    const after = await build(
      write(Message, undefined, markerResolver)
        .setContent("yes")
        .setRoom(ROOM_RELAY, "general")
        .setParent(parent),
    )

    expect(before.content).toBe(after.content)
    expect(before.tags).toEqual(after.tags)
  })

  it("drops the reference and the mention with the parent", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})

    const tmpl = await buildTemplate(
      write(Message, undefined, markerResolver)
        .setContent("yes")
        .setParent(parent)
        .clearParent()
        .setRoom(ROOM_RELAY, "general"),
      signer,
    )

    expect(tmpl.content).toBe("yes")
    expect(tmpl.tags.filter(t => ["q", "p"].includes(t[0]))).toEqual([])
  })

  // A client that encodes the reference without an author TLV still tags the
  // pubkey, so an edit takes its parent from the tag rather than the reference.
  it("keeps an author the content reference doesn't carry", async () => {
    const authorless = neventEncode({id: parentId, relays: [ROOM_RELAY]})
    const event = makeEvent({
      content: `nostr:${authorless}\n\nyes`,
      tags: [
        ["q", parentId, ROOM_RELAY, parentPubkey],
        ["p", parentPubkey, ROOM_RELAY],
      ],
    })

    const writer = write(Message, await read(Message, event)).setRoom(ROOM_RELAY, "general")
    const tmpl = await buildTemplate(writer, signer)

    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([["q", parentId, ROOM_RELAY, parentPubkey]])
    expect(tmpl.tags).toContainEqual(["p", parentPubkey, ROOM_RELAY])

    // Rendering the reference back from the tag names the author it was missing.
    const [uri] = tmpl.content.split("\n")

    expect(decode(uri.replace("nostr:", ""))).toEqual({
      type: "nevent",
      data: {id: parentId, author: parentPubkey, relays: []},
    })
  })

  it("tags a parent once however it was already quoted", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})
    const quoted = makeEvent({
      content: `yes, see nostr:${nevent}`,
      tags: [["q", parentId, PARENT_RELAY, parentPubkey]],
    })

    // Promoting a mid-content quote to a reply, and quoting the parent a second
    // time with addQuote, both leave one tag.
    const promoted = await buildTemplate(
      write(Message, await read(Message, quoted))
        .setParent(parent)
        .setRoom(ROOM_RELAY, "general"),
      signer,
    )

    expect(promoted.tags.filter(t => t[0] === "q")).toEqual([
      ["q", parentId, PARENT_RELAY, parentPubkey],
    ])

    const quotedTwice = await buildTemplate(
      write(Message).setContent("yes").setParent(parent).addQuote(parent).setRoom(ROOM_RELAY, "g"),
      signer,
    )

    expect(quotedTwice.tags.filter(t => t[0] === "q")).toEqual([["q", parentId, "", parentPubkey]])
  })

  it("reads back the quotes a writer is carrying", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})
    const writer = write(Message).setContent("yes").addQuote(parent)

    expect(writer.quotes()).toEqual([{value: parentId, relay: undefined, pubkey: parentPubkey}])

    writer.removeQuote(parentId)

    expect(writer.quotes()).toEqual([])
  })

  it("replies to a replaceable event by address", async () => {
    const parent = makeEvent({
      id: parentId,
      pubkey: parentPubkey,
      kind: LONG_FORM,
      tags: [["d", "x"]],
    })

    const tmpl = await buildTemplate(
      write(Message, undefined, markerResolver)
        .setContent("yes")
        .setParent(parent)
        .setRoom(ROOM_RELAY, "general"),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["q", address, "", parentPubkey])
    expect(tmpl.content).toBe(`nostr:${renderedNaddr}\n\nyes`)
  })

  it("round-trips an naddr reference", async () => {
    const event = makeEvent({
      content: `nostr:${naddr}\n\nyes`,
      tags: [["q", address, PARENT_RELAY, parentPubkey]],
    })

    const writer = write(Message, await read(Message, event)).setRoom(ROOM_RELAY, "general")

    expect(writer.content).toBe("yes")
    expect(writer.parentQuote).toEqual({value: address, relay: PARENT_RELAY, pubkey: parentPubkey})

    const tmpl = await buildTemplate(writer, signer)

    expect(tmpl.content).toBe(`nostr:${renderedNaddr}\n\nyes`)
    expect(tmpl.tags.filter(t => t[0] === "q")).toEqual([
      ["q", address, PARENT_RELAY, parentPubkey],
    ])
  })

  // Two address quotes have no id between them, so the parent is found by address.
  it("picks the address the content names out of several quotes", async () => {
    const other = new Address(LONG_FORM, pubkey, "y").toString()
    const event = makeEvent({
      content: `nostr:${naddr}\n\nyes`,
      tags: [
        ["q", other, "", pubkey],
        ["q", address, PARENT_RELAY, parentPubkey],
      ],
    })

    expect((await read(Message, event)).parent()).toEqual({
      value: address,
      relay: PARENT_RELAY,
      pubkey: parentPubkey,
    })
  })

  it("requires an explicit relay, and publishes only there", async () => {
    await expect(buildTemplate(write(Message).setContent("GM"), signer)).rejects.toThrow()

    const writer = write(Message, undefined, markerResolver)
      .setContent("GM")
      .setRoom(ROOM_RELAY, "general")

    expect(await publishRelays(writer)).toEqual([ROOM_RELAY])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Message, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})

describe("MessageQuery", () => {
  it("queries replies by their parent", async () => {
    const parent = makeEvent({id: parentId, pubkey: parentPubkey})

    expect(await query(Message).forParent(parent).renderFilters()).toEqual([
      {kinds: [MESSAGE], "#q": [parentId]},
    ])
  })

  it("queries the replies to a replaceable event by id and address", async () => {
    const parent = makeEvent({
      id: parentId,
      pubkey: parentPubkey,
      kind: LONG_FORM,
      tags: [["d", "x"]],
    })

    expect(await query(Message).forParent(parent).renderFilters()).toEqual([
      {kinds: [MESSAGE], "#q": [parentId, address]},
    ])
  })

  it("queries a room's messages from the relay hosting it", async () => {
    const q = query(Message, markerResolver).setRoom(ROOM_RELAY, "general").setLimit(100)

    expect(await q.renderFilters()).toEqual([{kinds: [MESSAGE], limit: 100, "#h": ["general"]}])
    expect(await queryRelays(q)).toEqual([ROOM_RELAY])
  })

  // Chat is relay-scoped, so a query infers no relays of its own.
  it("requests nothing until the caller pins a relay", async () => {
    expect(await queryRelays(query(Message, markerResolver).setAuthors([pubkey]))).toEqual([])
  })
})
