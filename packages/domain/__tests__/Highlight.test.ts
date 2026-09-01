import {describe, it, expect} from "vitest"
import {makeSecret, HIGHLIGHT, NOTE, LONG_FORM} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Highlight} from "../src/kinds/Highlight"
import {
  buildTemplate,
  read,
  write,
  markerResolver,
  publishRelays,
  OUTBOX,
  INBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const author = "aa".repeat(32)
const editor = "bb".repeat(32)
const mentioned = "cc".repeat(32)

const eventId = "11".repeat(32)
const relay = "wss://relay.example.com"
const url = "https://example.com/essay"
const text = "Moby-Dick, chapter 1"

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: HIGHLIGHT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const makeSource = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: eventId,
    pubkey: author,
    created_at: 0,
    kind: NOTE,
    tags: [],
    content: "the whole note",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Highlight", () => {
  it("reads the excerpt, source, attributions, and context", async () => {
    const h = await read(
      Highlight,
      makeEvent({
        content: "the highlighted bit",
        tags: [
          ["e", eventId, relay],
          ["p", author, relay, "author"],
          ["p", editor, relay, "editor"],
          ["context", "surrounding paragraph including the highlighted bit"],
          ["t", "nostr"],
        ],
      }),
    )

    expect(h.content()).toBe("the highlighted bit")
    expect(h.sources()).toEqual([{type: "event", id: eventId, relay}])
    expect(h.attributions()).toEqual([
      {pubkey: author, relay, role: "author"},
      {pubkey: editor, relay, role: "editor"},
    ])
    expect(h.mentions()).toEqual([])
    expect(h.sourceContext()).toBe("surrounding paragraph including the highlighted bit")
    expect(h.topics()).toEqual(["nostr"])
    expect(h.comment()).toBeUndefined()
  })

  it("reads every source type, including both tags for a replaceable source", async () => {
    const address = `${LONG_FORM}:${author}:my-article`

    const h = await read(
      Highlight,
      makeEvent({
        tags: [
          ["e", eventId, relay],
          ["a", address, relay],
        ],
      }),
    )

    expect(h.sources()).toEqual([
      {type: "event", id: eventId, relay},
      {type: "address", address, relay},
    ])

    const external = await read(Highlight, makeEvent({tags: [["i", "isbn:9780316769488"]]}))

    expect(external.sources()).toEqual([{type: "external", id: "isbn:9780316769488"}])

    const web = await read(Highlight, makeEvent({tags: [["r", url]]}))

    expect(web.sources()).toEqual([{type: "reference", value: url}])

    // An r tag may hold plain text rather than a url.
    const cited = await read(Highlight, makeEvent({tags: [["r", text, "source"]]}))

    expect(cited.sources()).toEqual([{type: "reference", value: text}])
  })

  it("separates a quote highlight's mentions from its attributions", async () => {
    const commentRef = "https://example.com/related"

    const h = await read(
      Highlight,
      makeEvent({
        content: "the highlighted bit",
        tags: [
          ["r", url, "source"],
          ["r", commentRef, "mention"],
          ["p", author, relay, "author"],
          ["p", mentioned, relay, "mention"],
          ["comment", "worth reading, see also nostr:npub…"],
        ],
      }),
    )

    expect(h.comment()).toBe("worth reading, see also nostr:npub…")
    // The mention-marked r tag is part of the comment, not the source.
    expect(h.sources()).toEqual([{type: "reference", value: url}])
    expect(h.references()).toEqual([commentRef])
    expect(h.attributions()).toEqual([{pubkey: author, relay, role: "author"}])
    expect(h.mentions()).toEqual([mentioned])
  })

  it("treats an unmarked p tag as an attribution", async () => {
    const h = await read(Highlight, makeEvent({tags: [["p", author]]}))

    expect(h.attributions()).toEqual([{pubkey: author, relay: "", role: undefined}])
    expect(h.mentions()).toEqual([])
  })

  it("builds a highlight of a nostr event, crediting its author", async () => {
    const tmpl = await buildTemplate(
      write(Highlight)
        .setContent("the highlighted bit")
        .setSourceEvent(makeSource())
        .setSourceContext("surrounding paragraph"),
      signer,
    )

    expect(tmpl.kind).toBe(HIGHLIGHT)
    expect(tmpl.content).toBe("the highlighted bit")
    expect(tmpl.tags).toContainEqual(["e", eventId, ""])
    expect(tmpl.tags).toContainEqual(["p", author, "", "author"])
    expect(tmpl.tags).toContainEqual(["context", "surrounding paragraph"])
    // A non-replaceable source gets no a tag.
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([])
  })

  it("tags a replaceable source both ways", async () => {
    const source = makeSource({kind: LONG_FORM, tags: [["d", "my-article"]]})

    const tmpl = await buildTemplate(write(Highlight).setSourceEvent(source), signer)

    expect(tmpl.tags).toContainEqual(["e", eventId, ""])
    expect(tmpl.tags).toContainEqual(["a", `${LONG_FORM}:${author}:my-article`, ""])
  })

  it("builds a quote highlight with marked source and mention tags", async () => {
    const tmpl = await buildTemplate(
      write(Highlight)
        .setContent("the highlighted bit")
        .setSourceReference(url)
        .setComment("worth reading")
        .addMention(mentioned),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["r", url, "source"])
    expect(tmpl.tags).toContainEqual(["p", mentioned, "", "mention"])
    expect(tmpl.tags).toContainEqual(["comment", "worth reading"])
  })

  it("replaces any prior source", async () => {
    const tmpl = await buildTemplate(
      write(Highlight)
        .setSourceEvent(makeSource())
        .setSourceExternal("isbn:9780316769488")
        .setSourceReference(url),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "e")).toEqual([])
    expect(tmpl.tags.filter(t => t[0] === "i")).toEqual([])
    expect(tmpl.tags.filter(t => t[0] === "r")).toEqual([["r", url, "source"]])
  })

  it("keeps one p tag per pubkey when a role changes", async () => {
    const tmpl = await buildTemplate(
      write(Highlight).addAttribution(author).addAttribution(author, "editor"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([["p", author, "", "editor"]])
  })

  it("removes an attribution, including a mention", async () => {
    const tmpl = await buildTemplate(
      write(Highlight)
        .addAttribution(author)
        .addAttribution(editor, "editor")
        .addMention(mentioned)
        .removeAttribution(author)
        .removeAttribution(mentioned),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([["p", editor, "", "editor"]])
  })

  it("round-trips without duplicating singleton tags", async () => {
    const event = makeEvent({
      content: "the highlighted bit",
      tags: [
        ["e", eventId, relay],
        ["p", author, relay, "author"],
        ["context", "surrounding paragraph"],
        ["comment", "worth reading"],
        ["t", "nostr"],
        ["alt", "a highlight"],
      ],
    })

    const tmpl = await buildTemplate(write(Highlight, await read(Highlight, event)), signer)

    for (const key of ["e", "p", "context", "comment", "t"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["p", author, relay, "author"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "a highlight"])
    expect(tmpl.content).toBe("the highlighted bit")
  })

  it("clears the context and comment", async () => {
    const event = makeEvent({
      tags: [
        ["context", "surrounding paragraph"],
        ["comment", "worth reading"],
      ],
    })

    const tmpl = await buildTemplate(
      write(Highlight, await read(Highlight, event))
        .clearSourceContext()
        .clearComment(),
      signer,
    )

    expect(tmpl.tags).toEqual([])
  })

  it("routes to the author's outbox and the attributed pubkeys' inboxes", async () => {
    const writer = write(Highlight, undefined, markerResolver)
      .setContent("the highlighted bit")
      .setSourceEvent(makeSource())

    // getUrls scores with random noise, so assert membership rather than order.
    const relays = await publishRelays(writer)

    expect(relays).toHaveLength(2)
    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Highlight, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
