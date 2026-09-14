import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getQuotes, parseQuote, renderQuote} from "../src/behaviors/Quote"

const author = "aa".repeat(32)
const a = "11".repeat(32)
const b = "22".repeat(32)
const relay = "wss://one.relay"

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: author,
    created_at: 0,
    kind: NOTE,
    tags,
    content: "",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("Quote", () => {
  describe("parseQuote", () => {
    it("parses a q tag's id, hint, and author", () => {
      expect(parseQuote(["q", a, relay, author])).toEqual({value: a, relay, pubkey: author})
    })

    it("leaves an absent hint and author undefined", () => {
      expect(parseQuote(["q", a])).toEqual({value: a, relay: undefined, pubkey: undefined})
      expect(parseQuote(["q", a, ""])).toEqual({value: a, relay: undefined, pubkey: undefined})
    })

    it("drops a pubkey that isn't one", () => {
      expect(parseQuote(["q", a, relay, "not-a-pubkey"])).toEqual({
        value: a,
        relay,
        pubkey: undefined,
      })
    })

    it("parses an address quote of a replaceable event", () => {
      const address = `${NOTE}:${author}:x`

      expect(parseQuote(["q", address, relay])).toEqual({
        value: address,
        relay,
        pubkey: undefined,
      })
    })

    it("skips other tags, and q tags that point at neither", () => {
      expect(parseQuote(["e", a])).toBeUndefined()
      expect(parseQuote(["q"])).toBeUndefined()
      expect(parseQuote(["q", ""])).toBeUndefined()
      expect(parseQuote(["q", "not-an-id"])).toBeUndefined()
    })
  })

  describe("getQuotes", () => {
    it("reads an event's q tags in the order they appear", () => {
      const quotes = getQuotes(
        makeEvent([
          ["p", author],
          ["q", b, "", author],
          ["q", a, relay],
        ]),
      )

      expect(quotes).toEqual([
        {value: b, relay: undefined, pubkey: author},
        {value: a, relay, pubkey: undefined},
      ])
    })

    it("returns nothing when an event quotes nothing", () => {
      expect(getQuotes(makeEvent([["p", author]]))).toEqual([])
    })

    it("reads an address quote alongside id quotes", () => {
      const address = `${NOTE}:${author}:x`

      expect(
        getQuotes(
          makeEvent([
            ["q", address],
            ["q", a],
          ]),
        ),
      ).toEqual([
        {value: address, relay: undefined, pubkey: undefined},
        {value: a, relay: undefined, pubkey: undefined},
      ])
    })
  })

  describe("renderQuote", () => {
    it("renders a q tag, keeping the hint slot for the pubkey that follows it", () => {
      expect(renderQuote({value: a, relay, pubkey: author})).toEqual(["q", a, relay, author])
      expect(renderQuote({value: a, pubkey: author})).toEqual(["q", a, "", author])
      expect(renderQuote({value: a, relay})).toEqual(["q", a, relay])
      expect(renderQuote({value: a})).toEqual(["q", a])
    })

    it("renders an address in the same slot as an id", () => {
      const address = `${NOTE}:${author}:x`

      expect(renderQuote({value: address, pubkey: author})).toEqual(["q", address, "", author])
    })

    it("round-trips a parsed quote", () => {
      for (const tag of [
        ["q", a, relay, author],
        ["q", `${NOTE}:${author}:x`, relay],
      ]) {
        expect(renderQuote(parseQuote(tag)!)).toEqual(tag)
      }
    })
  })
})
