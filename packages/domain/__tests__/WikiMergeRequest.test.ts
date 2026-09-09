import {describe, it, expect} from "vitest"
import {makeSecret, Resolver, WIKI, WIKI_MERGE_REQUEST, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {WikiMergeRequest} from "../src/kinds/WikiMergeRequest"
import {
  buildTemplate,
  read,
  write,
  query,
  queryRelays,
  publishRelays,
  markerResolver,
  INBOX,
  OUTBOX,
  PUBKEY_OUTBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const authorPubkey = "bb".repeat(32)
const baseId = "aa".repeat(32)
const sourceId = "cc".repeat(32)
const address = `${WIKI}:${authorPubkey}:bitcoin`

// Resolves every author's outbox to one recognizable url, so hint placement is visible.
const HINT = "wss://hint.test/"
const hintResolver = new Resolver(route => (route.type === "pubkeyOutbox" ? [HINT] : []))

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: WIKI_MERGE_REQUEST,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

// The article version being merged into, and the version proposed in its place.
const base = makeEvent({id: baseId, pubkey: authorPubkey, kind: WIKI, tags: [["d", "bitcoin"]]})
const source = makeEvent({id: sourceId, pubkey, kind: WIKI, tags: [["d", "bitcoin"]]})

describe("WikiMergeRequest", () => {
  it("reads the target article, its author, and both versions", async () => {
    const event = makeEvent({
      content: "I added information about the block size limit",
      tags: [
        ["a", address, HINT],
        ["e", baseId, HINT],
        ["p", authorPubkey],
        ["e", sourceId, HINT, "source"],
        ["alt", "x"],
      ],
    })

    const request = await read(WikiMergeRequest, event)

    expect(request.articleAddress()).toBe(address)
    expect(request.articleAuthor()).toBe(authorPubkey)
    expect(request.baseId()).toBe(baseId)
    expect(request.sourceId()).toBe(sourceId)
    expect(request.content()).toBe("I added information about the block size limit")
  })

  // The base version is optional, and the source marker is what tells the two
  // e tags apart.
  it("reads a request that names only the version to be merged", async () => {
    const request = await read(
      WikiMergeRequest,
      makeEvent({
        tags: [
          ["a", address],
          ["p", authorPubkey],
          ["e", sourceId, "", "source"],
        ],
      }),
    )

    expect(request.baseId()).toBeUndefined()
    expect(request.sourceId()).toBe(sourceId)
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "explanation",
      tags: [
        ["a", address, HINT],
        ["e", baseId, HINT],
        ["p", authorPubkey],
        ["e", sourceId, HINT, "source"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(
      write(WikiMergeRequest, await read(WikiMergeRequest, event)),
      signer,
    )

    for (const key of ["a", "p"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["e", sourceId, HINT, "source"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("explanation")
  })

  it("builds from the two versions, hinting at each author's outbox", async () => {
    const tmpl = await buildTemplate(
      write(WikiMergeRequest, undefined, hintResolver)
        .setContent("I added information about the block size limit")
        .setArticle(base)
        .setSource(source),
      signer,
    )

    expect(tmpl.kind).toBe(WIKI_MERGE_REQUEST)
    expect(tmpl.tags).toContainEqual(["a", address, HINT])
    expect(tmpl.tags).toContainEqual(["e", baseId, HINT])
    expect(tmpl.tags).toContainEqual(["p", authorPubkey, HINT])
    expect(tmpl.tags).toContainEqual(["e", sourceId, HINT, "source"])
  })

  // Retargeting replaces the destination outright rather than leaving the old
  // article's author p-tagged.
  it("replaces the target when set twice, leaving the source alone", async () => {
    const otherPubkey = "dd".repeat(32)
    const other = makeEvent({
      id: "11".repeat(32),
      pubkey: otherPubkey,
      kind: WIKI,
      tags: [["d", "bitcoin"]],
    })

    const tmpl = await buildTemplate(
      write(WikiMergeRequest).setSource(source).setArticle(base).setArticle(other),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([
      ["a", `${WIKI}:${otherPubkey}:bitcoin`, ""],
    ])
    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([["p", otherPubkey, ""]])
    expect(tmpl.tags).toContainEqual(["e", sourceId, "", "source"])
  })

  it("requires both the target article and the version to be merged", async () => {
    await expect(buildTemplate(write(WikiMergeRequest).setSource(source), signer)).rejects.toThrow(
      /a tag/,
    )

    await expect(buildTemplate(write(WikiMergeRequest).setArticle(base), signer)).rejects.toThrow(
      /source e tag/,
    )
  })

  // The request is directed at the target article's author, so it goes to their
  // inbox as well as the requester's outbox.
  it("publishes to the target author's inbox", async () => {
    const relays = await publishRelays(
      write(WikiMergeRequest, undefined, markerResolver).setArticle(base).setSource(source),
    )

    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(WikiMergeRequest, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})

describe("WikiMergeRequestQuery", () => {
  it("queries requests by the address of the article they target", async () => {
    expect(await query(WikiMergeRequest).forArticle(base).renderFilters()).toEqual([
      {kinds: [WIKI_MERGE_REQUEST], "#a": [address]},
    ])
  })

  it("requests them from the target author's inbox", async () => {
    const relays = await queryRelays(
      query(WikiMergeRequest, markerResolver).setAuthors([pubkey]).forArticle(base),
    )

    expect(relays).toContain(PUBKEY_OUTBOX)
    expect(relays).toContain(INBOX)
  })
})
