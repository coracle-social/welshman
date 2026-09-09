import {describe, it, expect} from "vitest"
import {Parsed, ParsedEvent, ParsedType, SummaryName, parse, renderAsText, summarize} from "../src"

const pubkey = "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322"

const event: ParsedEvent = {
  type: ParsedType.Event,
  value: {id: "1".repeat(64)},
  raw: "nostr:nevent1...",
}

const profile: Parsed = {
  type: ParsedType.Profile,
  value: {pubkey},
  raw: "nostr:nprofile1...",
}

const link = (url: string): Parsed => ({
  type: ParsedType.Link,
  value: {url: new URL(url), meta: {}},
  raw: url,
})

const profileName: SummaryName = parsed =>
  parsed.type === ParsedType.Profile ? "hodlbod" : undefined

const summaryOf = (parsed: Parsed | Parsed[], getName?: SummaryName) =>
  renderAsText(summarize(parsed, getName)).toString()

describe("summarize", () => {
  it("names entities instead of spelling them out", () => {
    expect(summaryOf(event)).toBe("another message")
    expect(summaryOf(profile)).toBe("someone")
    expect(
      summaryOf({
        type: ParsedType.Address,
        value: {identifier: "welshman", pubkey, kind: 30023},
        raw: "nostr:naddr1...",
      }),
    ).toBe("another post")
  })

  it("distinguishes an image from a link", () => {
    expect(summaryOf(link("https://example.com/cat.jpg"))).toBe("an image")
    expect(summaryOf(link("https://example.com/a/page"))).toBe("a link to example.com")
    expect(
      summaryOf({
        type: ParsedType.LinkGrid,
        value: {links: [{url: new URL("https://example.com/cat.jpg"), meta: {}}]},
        raw: "",
      }),
    ).toBe("some images")
  })

  it("reads the plain value of things a link renderer would spell out", () => {
    expect(
      summaryOf({
        type: ParsedType.Email,
        value: "hodlbod@coracle.social",
        raw: "hodlbod@coracle.social",
      }),
    ).toBe("hodlbod@coracle.social")
    expect(summaryOf({type: ParsedType.Emoji, value: {name: "parrot"}, raw: ":parrot:"})).toBe(
      "parrot",
    )
    expect(
      summaryOf({
        type: ParsedType.Room,
        value: {url: "wss://relay.example.com", room: "welshman"},
        raw: "wss://relay.example.com'welshman",
      }),
    ).toBe("welshman")
    expect(summaryOf({type: ParsedType.Invoice, value: "lnbc1...", raw: "lnbc1..."})).toBe(
      "a lightning invoice",
    )
  })

  it("leaves prose alone", () => {
    const parsed: Parsed[] = [
      {type: ParsedType.Text, value: "look at ", raw: "look at "},
      {type: ParsedType.Topic, value: "nostr", raw: "#nostr"},
      {type: ParsedType.Newline, value: "\n", raw: "\n"},
      {type: ParsedType.Code, value: "parse()", raw: "`parse()`"},
    ]

    expect(summarize(parsed)).toEqual(parsed)
    expect(summaryOf(parsed)).toBe("look at nostr\nparse()")
  })

  it("takes an override, and names what it declines to the default", () => {
    expect(summaryOf(profile, profileName)).toBe("hodlbod")
    expect(
      summaryOf(
        [profile, {type: ParsedType.Text, value: " sent ", raw: " sent "}, event],
        profileName,
      ),
    ).toBe("hodlbod sent another message")
  })

  it("keeps the raw text of what it named", () => {
    const [named] = summarize(event)

    expect(named.raw).toBe(event.raw)
  })

  it("summarizes parsed event content", () => {
    const content =
      "hey nostr:npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn look at https://example.com/cat.jpg"

    expect(summaryOf(parse({content}), profileName)).toBe("hey hodlbod look at an image")
  })
})
