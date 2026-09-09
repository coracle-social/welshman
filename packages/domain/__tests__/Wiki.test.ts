import {describe, it, expect} from "vitest"
import {makeSecret, Resolver, WIKI, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Wiki} from "../src/kinds/Wiki"
import {
  buildTemplate,
  read,
  write,
  query,
  queryRelays,
  markerResolver,
  PUBKEY_OUTBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const otherPubkey = "bb".repeat(32)
const otherId = "aa".repeat(32)

// Resolves every author's outbox to one recognizable url, so hint placement is visible.
const HINT = "wss://hint.test/"
const hintResolver = new Resolver(route => (route.type === "pubkeyOutbox" ? [HINT] : []))

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: WIKI,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const makeArticle = (identifier: string, overrides: Partial<TrustedEvent> = {}) =>
  makeEvent({id: otherId, pubkey: otherPubkey, tags: [["d", identifier]], ...overrides})

describe("Wiki", () => {
  it("reads represented tags and content", async () => {
    const event = makeEvent({
      content: "Bitcoin is a [cryptocurrency][] invented by Satoshi Nakamoto.",
      tags: [
        ["d", "bitcoin"],
        ["title", "Bitcoin"],
        ["summary", "A digital currency"],
        ["alt", "x"],
      ],
    })

    const article = await read(Wiki, event)

    expect(article.identifier()).toBe("bitcoin")
    expect(article.title()).toBe("Bitcoin")
    expect(article.summary()).toBe("A digital currency")
    expect(article.fork()).toBeUndefined()
    expect(article.deferral()).toBeUndefined()
    expect(article.content()).toBe("Bitcoin is a [cryptocurrency][] invented by Satoshi Nakamoto.")
  })

  it("reads fork and defer references from their marked tag pairs", async () => {
    const address = `${WIKI}:${otherPubkey}:bitcoin`
    const deferId = "cc".repeat(32)
    const deferAddress = `${WIKI}:${pubkey}:bitcoin`

    const article = await read(
      Wiki,
      makeEvent({
        tags: [
          ["d", "bitcoin"],
          ["e", otherId, HINT, "fork"],
          ["a", address, HINT, "fork"],
          ["e", deferId, "", "defer"],
          ["a", deferAddress, "", "defer"],
        ],
      }),
    )

    expect(article.fork()).toEqual({id: otherId, address, relay: HINT})
    expect(article.deferral()).toEqual({id: deferId, address: deferAddress, relay: ""})
  })

  // Readers are lenient: an event that tags only one half of the pair, or that
  // uses the markers on unrelated tags, still reads.
  it("reads a fork tagged by address alone, and ignores unmarked references", async () => {
    const address = `${WIKI}:${otherPubkey}:bitcoin`

    const article = await read(
      Wiki,
      makeEvent({
        tags: [
          ["d", "bitcoin"],
          ["a", address, "", "fork"],
          ["e", "dd".repeat(32)],
        ],
      }),
    )

    expect(article.fork()).toEqual({id: undefined, address, relay: ""})
    expect(article.deferral()).toBeUndefined()
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "body",
      tags: [
        ["d", "bitcoin"],
        ["title", "Bitcoin"],
        ["summary", "A digital currency"],
        ["e", otherId, "", "fork"],
        ["a", `${WIKI}:${otherPubkey}:bitcoin`, "", "fork"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(Wiki, await read(Wiki, event)), signer)

    for (const key of ["d", "title", "summary", "e", "a"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "bitcoin"])
    expect(tmpl.tags).toContainEqual(["e", otherId, "", "fork"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("body")
  })

  it("normalizes the identifier and keeps the typed name as the title", async () => {
    const tmpl = await buildTemplate(
      write(Wiki).setName("Proof of Work!").setContent("body"),
      signer,
    )

    expect(tmpl.kind).toBe(WIKI)
    expect(tmpl.tags).toContainEqual(["d", "proof-of-work"])
    expect(tmpl.tags).toContainEqual(["title", "Proof of Work!"])
    expect(tmpl.content).toBe("body")
  })

  it("refuses to write an identifier that isn't normalized", async () => {
    await expect(buildTemplate(write(Wiki).setIdentifier("Proof of Work"), signer)).rejects.toThrow(
      /normalized/,
    )
  })

  it("tags a fork with both references and a hint, replacing an earlier one", async () => {
    const source = makeArticle("bitcoin")
    const older = makeEvent({id: "dd".repeat(32), pubkey, tags: [["d", "bitcoin"]]})

    const tmpl = await buildTemplate(
      write(Wiki, undefined, hintResolver).setName("Bitcoin").setFork(older).setFork(source),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["e", otherId, HINT, "fork"])
    expect(tmpl.tags).toContainEqual(["a", `${WIKI}:${otherPubkey}:bitcoin`, HINT, "fork"])
    expect(tmpl.tags.filter(t => t[3] === "fork").length).toBe(2)
  })

  // The two markers are independent, so setting one leaves the other in place.
  it("keeps a fork when a deferral is added, and clears each on its own", async () => {
    const source = makeArticle("bitcoin")

    const writer = write(Wiki).setName("Bitcoin").setFork(source).setDeferral(source)

    expect((await buildTemplate(writer, signer)).tags.filter(t => t[3] === "fork").length).toBe(2)
    expect((await buildTemplate(writer, signer)).tags.filter(t => t[3] === "defer").length).toBe(2)

    writer.clearFork()

    const tmpl = await buildTemplate(writer, signer)

    expect(tmpl.tags.filter(t => t[3] === "fork")).toEqual([])
    expect(tmpl.tags.filter(t => t[3] === "defer").length).toBe(2)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Wiki, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})

describe("WikiQuery", () => {
  it("looks up a subject by its normalized name", async () => {
    expect(await query(Wiki).forName("Proof of Work", "bitcoin").renderFilters()).toEqual([
      {kinds: [WIKI], "#d": ["proof-of-work", "bitcoin"]},
    ])
  })

  it("requests an author's articles from their outbox", async () => {
    expect(await queryRelays(query(Wiki, markerResolver).setAuthors([pubkey]))).toEqual([
      PUBKEY_OUTBOX,
    ])
  })
})
