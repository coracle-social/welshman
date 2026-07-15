import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getEmojis} from "../src/behaviors/Emoji"

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "aa".repeat(32),
    created_at: 0,
    kind: NOTE,
    tags,
    content: "",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("getEmojis", () => {
  it("parses shortcode and url, with an optional emoji-set address", () => {
    const emojis = getEmojis(
      makeEvent([
        ["emoji", "gleasonator", "https://example.com/gleasonator.png"],
        ["emoji", "blobcat", "https://example.com/blobcat.png", "30030:abc:blobcats"],
        ["alt", "x"],
      ]),
    )

    expect(emojis).toEqual([
      {shortcode: "gleasonator", url: "https://example.com/gleasonator.png"},
      {shortcode: "blobcat", url: "https://example.com/blobcat.png", address: "30030:abc:blobcats"},
    ])
  })

  it("skips emoji tags missing a shortcode or url", () => {
    expect(
      getEmojis(makeEvent([["emoji", "nourl"], ["emoji"], ["emoji", "", "https://example.com/x"]])),
    ).toEqual([])
  })
})
