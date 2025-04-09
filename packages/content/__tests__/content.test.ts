import {describe, it, expect} from "vitest"
import {ParsedLink, ParsedType, parse, reduceLinks, renderAsHtml, renderAsText} from "../src"
import {npubEncode, noteEncode} from "nostr-tools/nip19"

describe("Content Parsing", () => {
  const npub = npubEncode("ee".repeat(32))
  const nevent = noteEncode("ff".repeat(32))
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

    it("should parse topics", () => {
      const result = parse({content: "#nostr is cool"})
      expect(result[0]).toMatchObject({
        type: ParsedType.Topic,
        value: "nostr",
      })
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
