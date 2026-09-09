import {describe, it, expect} from "vitest"
import {makeSecret, Resolver, WIKI, WIKI_REDIRECT, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {WikiRedirect} from "../src/kinds/WikiRedirect"
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
const authorPubkey = "bb".repeat(32)
const address = `${WIKI}:${authorPubkey}:bitcoin`

// Resolves every author's outbox to one recognizable url, so hint placement is visible.
const HINT = "wss://hint.test/"
const hintResolver = new Resolver(route => (route.type === "pubkeyOutbox" ? [HINT] : []))

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: WIKI_REDIRECT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const article = makeEvent({
  id: "aa".repeat(32),
  pubkey: authorPubkey,
  kind: WIKI,
  tags: [["d", "bitcoin"]],
})

describe("WikiRedirect", () => {
  it("reads the subject it stands in for and the article it points at", async () => {
    const redirect = await read(
      WikiRedirect,
      makeEvent({
        tags: [
          ["d", "btc"],
          ["a", address, HINT],
          ["alt", "x"],
        ],
      }),
    )

    expect(redirect.identifier()).toBe("btc")
    expect(redirect.articleAddress()).toBe(address)
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      tags: [
        ["d", "btc"],
        ["a", address, HINT],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(WikiRedirect, await read(WikiRedirect, event)), signer)

    for (const key of ["d", "a"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "btc"])
    expect(tmpl.tags).toContainEqual(["a", address, HINT])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("normalizes the redirected subject and hints at the article's author", async () => {
    const tmpl = await buildTemplate(
      write(WikiRedirect, undefined, hintResolver).setName("BTC").setArticle(article),
      signer,
    )

    expect(tmpl.kind).toBe(WIKI_REDIRECT)
    expect(tmpl.tags).toContainEqual(["d", "btc"])
    expect(tmpl.tags).toContainEqual(["a", address, HINT])
    expect(tmpl.content).toBe("")
  })

  it("points at one article at a time", async () => {
    const other = makeEvent({
      id: "cc".repeat(32),
      pubkey,
      kind: WIKI,
      tags: [["d", "bitcoin-cash"]],
    })

    const tmpl = await buildTemplate(
      write(WikiRedirect).setName("BTC").setArticle(article).setArticle(other),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([
      ["a", `${WIKI}:${pubkey}:bitcoin-cash`, ""],
    ])
  })

  it("requires a normalized subject and an article to point at", async () => {
    await expect(
      buildTemplate(write(WikiRedirect).setIdentifier("BTC").setArticle(article), signer),
    ).rejects.toThrow(/normalized/)

    await expect(buildTemplate(write(WikiRedirect).setName("BTC"), signer)).rejects.toThrow(/a tag/)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(WikiRedirect, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})

describe("WikiRedirectQuery", () => {
  it("queries redirects away from a subject and redirects into an article", async () => {
    expect(await query(WikiRedirect).forName("BTC").renderFilters()).toEqual([
      {kinds: [WIKI_REDIRECT], "#d": ["btc"]},
    ])

    expect(await query(WikiRedirect).forArticle(article).renderFilters()).toEqual([
      {kinds: [WIKI_REDIRECT], "#a": [address]},
    ])
  })

  it("requests an author's redirects from their outbox", async () => {
    expect(await queryRelays(query(WikiRedirect, markerResolver).setAuthors([pubkey]))).toEqual([
      PUBKEY_OUTBOX,
    ])
  })
})
