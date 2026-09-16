import {describe, it, expect} from "vitest"
import {truncate, ParsedType, Parsed, ParsedCode, ParsedText} from "../src"

describe("Content Truncation", () => {
  it("should not truncate content shorter than minLength", () => {
    const content: Parsed[] = [{type: ParsedType.Text, value: "Short text", raw: "Short text"}]
    const result = truncate(content, {minLength: 20, maxLength: 30})
    expect(result).toEqual(content)
  })

  it("should cut inside the first item when it's longer than maxLength", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(600), raw: "a".repeat(600)},
    ]
    const result = truncate(content, {minLength: 400, maxLength: 600})
    expect(result[0].type).toEqual(ParsedType.Text)
    expect((result[0] as ParsedText).value).toEqual("a".repeat(400))
    expect(result[1].type).toEqual(ParsedType.Ellipsis)
    expect(result).toHaveLength(2)
  })

  it("should cut inside a code block that is the whole message", () => {
    const value = "const x = 1\n".repeat(200)
    const content: Parsed[] = [{type: ParsedType.Code, value, raw: "```" + value + "```"}]
    const result = truncate(content, {minLength: 500, maxLength: 700})
    const code = result[0] as ParsedCode

    expect(code.type).toEqual(ParsedType.Code)
    expect(code.value.length).toBeLessThanOrEqual(500)
    expect(code.value).toEqual(value.slice(0, code.value.length))
    expect(result[1].type).toEqual(ParsedType.Ellipsis)
    expect(result).toHaveLength(2)
  })

  it("should cut a code block at its last whole line", () => {
    const value = "const x = 1\n".repeat(200)
    const result = truncate([{type: ParsedType.Code, value, raw: value}], {
      minLength: 500,
      maxLength: 700,
    })

    expect((result[0] as ParsedCode).value.endsWith("const x = 1")).toBe(true)
  })

  it("should keep the elements before the one it cuts", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {type: ParsedType.Newline, value: "\n", raw: "\n"},
      {type: ParsedType.Code, value: "b".repeat(1000), raw: "b".repeat(1000)},
    ]
    const result = truncate(content, {minLength: 400, maxLength: 700})

    expect(result.map(p => p.type)).toEqual([
      ParsedType.Text,
      ParsedType.Newline,
      ParsedType.Code,
      ParsedType.Ellipsis,
    ])
    expect((result[2] as ParsedCode).value).toEqual("b".repeat(199))
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

    expect(result).toHaveLength(3) // text + link = 300 + 250 = 550
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

    expect(result).toHaveLength(3) // text + profile
  })

  it("should handle mixed content types correctly", () => {
    const content: Parsed[] = [
      {type: ParsedType.Text, value: "a".repeat(200), raw: "a".repeat(200)},
      {
        type: ParsedType.Link,
        value: {
          url: new URL("https://example.com/image.jpg"),
          meta: {},
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
            {url: new URL("https://example.com/1.jpg"), meta: {}},
            {url: new URL("https://example.com/2.jpg"), meta: {}},
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
