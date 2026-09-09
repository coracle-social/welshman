import {describe, it, expect} from "vitest"
import {
  ParsedLink,
  ParsedType,
  isCommand,
  parse,
  reduceLinks,
  renderAsHtml,
  renderAsText,
} from "../src"
import {npubEncode, noteEncode} from "nostr-tools/nip19"

describe("Content Parsing", () => {
  const npub = npubEncode("ee".repeat(32))
  const nevent = noteEncode("ff".repeat(32))
  // BOLT11 test vector, and an LNURL — both real, since what makes them parseable is their shape
  const invoice =
    "lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp"
  const lnurl =
    "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexujcc32r"
  describe("Basic Parsing", () => {
    it("should parse plain text", () => {
      const result = parse({content: "Hello world"})
      expect(result).toEqual([{type: ParsedType.Text, value: "Hello world", raw: "Hello world"}])
    })

    it("should parse newlines", () => {
      const result = parse({content: "Hello\nworld"})
      expect(result).toEqual([
        {type: ParsedType.Text, value: "Hello", raw: "Hello"},
        {type: ParsedType.Newline, value: "\n", raw: "\n"},
        {type: ParsedType.Text, value: "world", raw: "world"},
      ])
    })
  })

  describe("Link Parsing", () => {
    it("should parse basic URLs", () => {
      const result = parse({content: "Check https://example.com"})
      const parsed = result[1] as ParsedLink

      expect(parsed).toMatchObject({
        type: ParsedType.Link,
        value: {
          url: expect.any(URL),
        },
      })

      expect(parsed.value.url.toString()).toBe("https://example.com/")
    })

    it("should parse URLs without protocol", () => {
      const result = parse({content: "Visit example.com"})
      const parsed = result[1] as ParsedLink

      expect(parsed).toMatchObject({
        type: ParsedType.Link,
        value: {
          url: expect.any(URL),
        },
      })

      expect(parsed.value.url.toString()).toBe("https://example.com/")
    })

    it("should identify media links", () => {
      const result = parse({content: "https://example.com/image.jpg"})
      expect(result[0]).toMatchObject({
        type: ParsedType.Link,
        value: {
          url: expect.any(URL),
          meta: {},
        },
      })
    })
  })

  describe("Nostr Entity Parsing", () => {
    it("should parse nostr profiles", () => {
      const result = parse({
        content: `nostr:${npub}`,
      })

      expect(result[0]).toMatchObject({
        type: ParsedType.Profile,
      })
    })

    it("should parse nostr events", () => {
      const result = parse({
        content: `nostr:${nevent}`,
      })
      expect(result[0]).toMatchObject({
        type: ParsedType.Event,
      })
    })
  })

  describe("Special Content Parsing", () => {
    it("should parse code blocks", () => {
      const result = parse({content: "```const x = 1```"})
      expect(result[0]).toMatchObject({
        type: ParsedType.Code,
        value: "const x = 1",
      })
    })

    it("should parse inline code", () => {
      const result = parse({content: "Use `npm install`"})
      expect(result[1]).toMatchObject({
        type: ParsedType.Code,
        value: "npm install",
      })
    })

    it("should parse rooms", () => {
      const result = parse({content: "join spatia-arcana.com'bamothoythr today"})

      expect(result[1]).toMatchObject({
        type: ParsedType.Room,
        value: {url: "wss://spatia-arcana.com/", room: "bamothoythr"},
        raw: "spatia-arcana.com'bamothoythr",
      })
    })

    it("should parse rooms with a protocol", () => {
      const result = parse({content: "ws://relay.example.com:7777'my-room_1"})

      expect(result[0]).toMatchObject({
        type: ParsedType.Room,
        value: {url: "ws://relay.example.com:7777/", room: "my-room_1"},
        raw: "ws://relay.example.com:7777'my-room_1",
      })
    })

    it("should parse rooms with a trailing slash on the url", () => {
      const result = parse({content: "wss://spatia-arcana.com/'ipreakrutroo"})

      expect(result[0]).toMatchObject({
        type: ParsedType.Room,
        value: {url: "wss://spatia-arcana.com/", room: "ipreakrutroo"},
        raw: "wss://spatia-arcana.com/'ipreakrutroo",
      })
    })

    it("should parse rooms with a curly apostrophe", () => {
      const result = parse({content: "wss://spatia-arcana.com’ipreakrutroo"})

      expect(result[0]).toMatchObject({
        type: ParsedType.Room,
        value: {url: "wss://spatia-arcana.com/", room: "ipreakrutroo"},
        raw: "wss://spatia-arcana.com’ipreakrutroo",
      })
    })

    it("should not parse possessives as rooms", () => {
      const result = parse({content: "example.com's rooms"})

      expect(result[0]).toMatchObject({type: ParsedType.Link})
    })

    it("should parse topics", () => {
      const result = parse({content: "#nostr is cool"})
      expect(result[0]).toMatchObject({
        type: ParsedType.Topic,
        value: "nostr",
      })
    })

    it("should parse a bare invoice", () => {
      const result = parse({content: `pay ${invoice} please`})

      expect(result[1]).toMatchObject({type: ParsedType.Invoice, value: invoice})
    })

    it("should parse a bare lnurl", () => {
      const result = parse({content: lnurl})

      expect(result[0]).toMatchObject({type: ParsedType.Invoice, value: lnurl})
    })

    it("should strip the lightning scheme from an invoice's value", () => {
      const result = parse({content: `lightning:${invoice}`})

      expect(result[0]).toMatchObject({
        type: ParsedType.Invoice,
        value: invoice,
        raw: `lightning:${invoice}`,
      })
    })

    it("should not parse a domain starting with lnbc as an invoice", () => {
      const result = parse({content: "lnbcsomethinglonger.example"})

      expect(result[0]).toMatchObject({type: ParsedType.Link})
    })
  })

  describe("Command Parsing", () => {
    it("should parse a leading command", () => {
      const result = parse({content: "/kick spammer"})

      expect(result[0]).toMatchObject({
        type: ParsedType.Command,
        value: {command: "kick"},
        raw: "/kick",
      })
      expect(result[1]).toMatchObject({type: ParsedType.Text, value: " spammer"})
    })

    it("should parse a command's qualifier as a pubkey", () => {
      const result = parse({content: `/kick@${npub} spammer`})

      expect(result[0]).toMatchObject({
        type: ParsedType.Command,
        value: {command: "kick", pubkey: "ee".repeat(32)},
        raw: `/kick@${npub}`,
      })
    })

    it("should parse arguments as content", () => {
      const result = parse({content: `/mute ${npub}`})

      expect(result[0]).toMatchObject({type: ParsedType.Command})
      expect(result[2]).toMatchObject({type: ParsedType.Profile})
    })

    it("should not parse a command anywhere but the start", () => {
      const result = parse({content: "look in /etc/passwd"})

      expect(result.some(isCommand)).toBe(false)
    })

    it("should not parse a command whose qualifier names nobody", () => {
      const result = parse({content: "/kick@spammer"})

      expect(result.some(isCommand)).toBe(false)
    })

    it("should render a command as the text it was written as", () => {
      const parsed = parse({content: `/kick@${npub} spammer`})

      expect(renderAsText(parsed).toString()).toBe(`/kick@${npub} spammer`)
    })
  })

  describe("Rendering", () => {
    it("should render as text", () => {
      const parsed = parse({content: "Hello https://example.com"})
      const rendered = renderAsText(parsed).toString()
      expect(rendered).toContain("Hello")
      expect(rendered).toContain("https://example.com")
    })

    it("should render as HTML", () => {
      const parsed = parse({content: "Hello https://example.com"})
      const rendered = renderAsHtml(parsed).toString()
      expect(rendered).toContain('<a href="https://example.com/"')
    })
  })

  describe("Link Grid", () => {
    it("should reduce consecutive image links into a grid", () => {
      const content = parse({
        content: "https://example.com/1.jpg\nhttps://example.com/2.jpg https://example.com/2.jpg",
      })
      const reduced = reduceLinks(content)
      expect(reduced[0]).toMatchObject({
        type: ParsedType.LinkGrid,
        value: {
          links: expect.any(Array),
        },
      })
    })
  })

  describe("Legacy Mention Parsing", () => {
    it("should parse legacy mentions", () => {
      const result = parse({
        content: "#[0]",
        tags: [["p", "1234567890"]],
      })
      expect(result[0]).toMatchObject({
        type: ParsedType.Profile,
      })
    })
  })
})
