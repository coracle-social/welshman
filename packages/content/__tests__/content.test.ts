import {describe, it, expect} from "vitest"
import * as Content from "../src"
import {npubEncode, noteEncode} from "nostr-tools/nip19"

describe("Content Parsing", () => {
  const npub = npubEncode("ee".repeat(32))
  const nevent = noteEncode("ff".repeat(32))
  describe("Basic Parsing", () => {
    it("should parse plain text", () => {
      const result = Content.parse({content: "Hello world"})
      expect(result).toEqual([
        {type: Content.ParsedType.Text, value: "Hello world", raw: "Hello world"},
      ])
    })

    it("should parse newlines", () => {
      const result = Content.parse({content: "Hello\nworld"})
      expect(result).toEqual([
        {type: Content.ParsedType.Text, value: "Hello", raw: "Hello"},
        {type: Content.ParsedType.Newline, value: "\n", raw: "\n"},
        {type: Content.ParsedType.Text, value: "world", raw: "world"},
      ])
    })
  })

  describe("Link Parsing", () => {
    it("should parse basic URLs", () => {
      const result = Content.parse({content: "Check https://example.com"})
      expect(result[1]).toMatchObject({
        type: Content.ParsedType.Link,
        value: {
          url: expect.any(URL),
          isMedia: false,
        },
      })
      expect(result[1].value.url.toString()).toBe("https://example.com/")
    })

    it("should parse URLs without protocol", () => {
      const result = Content.parse({content: "Visit example.com"})
      expect(result[1]).toMatchObject({
        type: Content.ParsedType.Link,
        value: {
          url: expect.any(URL),
          isMedia: false,
        },
      })
      expect(result[1].value.url.toString()).toBe("https://example.com/")
    })

    it("should identify media links", () => {
      const result = Content.parse({content: "https://example.com/image.jpg"})
      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Link,
        value: {
          isMedia: true,
        },
      })
    })
  })

  describe("Nostr Entity Parsing", () => {
    it("should parse nostr profiles", () => {
      const result = Content.parse({
        content: `nostr:${npub}`,
      })

      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Profile,
      })
    })

    it("should parse nostr events", () => {
      const result = Content.parse({
        content: `nostr:${nevent}`,
      })
      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Event,
      })
    })
  })

  describe("Special Content Parsing", () => {
    it("should parse code blocks", () => {
      const result = Content.parse({content: "```const x = 1```"})
      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Code,
        value: "const x = 1",
      })
    })

    it("should parse inline code", () => {
      const result = Content.parse({content: "Use `npm install`"})
      expect(result[1]).toMatchObject({
        type: Content.ParsedType.Code,
        value: "npm install",
      })
    })

    it("should parse topics", () => {
      const result = Content.parse({content: "#nostr is cool"})
      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Topic,
        value: "nostr",
      })
    })
  })

  describe("Rendering", () => {
    it("should render as text", () => {
      const parsed = Content.parse({content: "Hello https://example.com"})
      const rendered = Content.renderAsText(parsed).toString()
      expect(rendered).toContain("Hello")
      expect(rendered).toContain("https://example.com")
    })

    it("should render as HTML", () => {
      const parsed = Content.parse({content: "Hello https://example.com"})
      const rendered = Content.renderAsHtml(parsed).toString()
      expect(rendered).toContain('<a href="https://example.com/"')
    })
  })

  describe("Link Grid", () => {
    it("should reduce consecutive image links into a grid", () => {
      const content = Content.parse({
        content: "https://example.com/1.jpg\nhttps://example.com/2.jpg https://example.com/2.jpg",
      })
      const reduced = Content.reduceLinks(content)
      expect(reduced[0]).toMatchObject({
        type: Content.ParsedType.LinkGrid,
        value: {
          links: expect.any(Array),
        },
      })
    })
  })

  describe("Legacy Mention Parsing", () => {
    it("should parse legacy mentions", () => {
      const result = Content.parse({
        content: "#[0]",
        tags: [["p", "1234567890"]],
      })
      expect(result[0]).toMatchObject({
        type: Content.ParsedType.Profile,
      })
    })
  })
})
