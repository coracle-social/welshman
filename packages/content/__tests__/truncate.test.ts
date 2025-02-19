import {describe, it, expect} from "vitest"
import {truncate, ParsedType, Parsed} from "../src"

describe("Content Truncation", () => {
  it("should not truncate content shorter than minLength", () => {
    const content: Parsed[] = [{type: ParsedType.Text, value: "Short text", raw: "Short text"}]
    const result = truncate(content, {minLength: 20, maxLength: 30})
    expect(result).toEqual(content)
  })

  it("should not truncate the first item even if it's longer than maxLength", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(600), raw: "a".repeat(600)},
    ]
    const result = truncate(content, {minLength: 400, maxLength: 600})
    expect(result[0].type).toEqual(ParsedType.Text)
    expect(result[1].type).toEqual(ParsedType.Ellipsis)
    expect(result).toHaveLength(2)
  })

  it("should not truncate text content between minLength and maxLength", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(600), raw: "a".repeat(600)},
      {type: ParsedType.Newline, value: "\n", raw: "\n"},
    ]
    const result = truncate(content, {minLength: 500, maxLength: 700})
    expect(result).toHaveLength(2)
    expect(result[1].type).toEqual(ParsedType.Newline)
  })

  it("should account for mediaLength in link calculations", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(300), raw: "a".repeat(300)},
      {
        type: ParsedType.Link,
        value: {
          url: new URL("https://example.com/image.jpg"),
          meta: {},
          isMedia: true,
        },
        raw: "https://example.com/image.jpg",
      },
    ]
    const result = truncate(content, {
      minLength: 400,
      maxLength: 500,
      mediaLength: 250,
    })
    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis) // ellipsis

    expect(result).toHaveLength(2) // text + link = 300 + 250 = 550
  })

  it("should account for entityLength in nostr entity calculations", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(300), raw: "a".repeat(300)},
      {
        type: ParsedType.Profile,
        value: {
          pubkey: "1234567890",
          relays: [],
        },
        raw: "nostr:npub1...",
      },
    ]
    const result = truncate(content, {
      minLength: 300,
      maxLength: 400,
      entityLength: 110,
    })

    // 300 + 110 = 410, which is over the maxLength
    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis) // ellipsis

    expect(result).toHaveLength(2) // text + profile
  })

  it("should handle mixed content types correctly", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {
        type: ParsedType.Link,
        value: {
          url: new URL("https://example.com/image.jpg"),
          meta: {},
          isMedia: true,
        },
        raw: "https://example.com/image.jpg",
      },
      {type: ParsedType.Text, value: "b".repeat(200), raw: "b".repeat(200)},
      {
        type: ParsedType.Profile,
        value: {
          pubkey: "1234567890",
          relays: [],
        },
        raw: "nostr:npub1...",
      },
    ]
    const result = truncate(content, {
      minLength: 400,
      maxLength: 500,
      mediaLength: 200,
      entityLength: 30,
    })

    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis)
  })

  it("should handle code blocks correctly", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {type: ParsedType.Code, value: "b".repeat(300), raw: "```" + "b".repeat(300) + "```"},
    ]
    const result = truncate(content, {
      minLength: 400,
      maxLength: 500,
    })

    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis)
  })

  it("should handle invoice and cashu tokens", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {type: ParsedType.Invoice, value: "lnbc...", raw: "lnbc..."},
      {type: ParsedType.Cashu, value: "cashu...", raw: "cashu..."},
    ]
    const result = truncate(content, {
      minLength: 300,
      maxLength: 400,
      mediaLength: 200,
    })
    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis)
  })

  it("should handle link grids", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {
        type: ParsedType.LinkGrid,
        value: {
          links: [
            {url: new URL("https://example.com/1.jpg"), meta: {}, isMedia: true},
            {url: new URL("https://example.com/2.jpg"), meta: {}, isMedia: true},
          ],
        },
        raw: "",
      },
    ]
    const result = truncate(content, {
      minLength: 300,
      maxLength: 400,
      mediaLength: 200,
    })
    expect(result[result.length - 1].type).toBe(ParsedType.Ellipsis)
  })
})
