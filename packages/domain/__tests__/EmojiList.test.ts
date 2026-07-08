import {describe, it, expect} from "vitest"
import {makeSecret, EMOJIS, NOTE, getAddressTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {EmojiList} from "../src/kinds/EmojiList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const setAddress = `30030:${"aa".repeat(32)}:my-emojis`
const emojiTag = ["emoji", "soapbox", "https://example.com/soapbox.png"]
const emojiTag2 = ["emoji", "ostrich", "https://example.com/ostrich.png"]

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: EMOJIS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("EmojiList", () => {
  it("reads emoji-set addresses and inline emoji tags", async () => {
    const event = makeEvent({
      tags: [["a", setAddress], emojiTag, ["alt", "x"]],
    })

    const list = await EmojiList.read(event)

    expect(list.emojiSets()).toEqual([setAddress])
    expect(list.emojis()).toEqual([emojiTag])
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [["a", setAddress], emojiTag, ["alt", "x"]],
    })

    const list = await EmojiList.read(event)
    const tmpl = await EmojiList.builder(list).toTemplate(signer)

    expect(tmpl.kind).toBe(EMOJIS)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "emoji").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await EmojiList.builder()
      .addEmojiSet(setAddress)
      .addEmoji("soapbox", "https://example.com/soapbox.png")
      .toTemplate(signer)

    expect(getAddressTagValues(tmpl.tags)).toEqual([setAddress])
    expect(tmpl.tags).toContainEqual(emojiTag)
  })

  it("removeEmoji removes by value", async () => {
    const event = makeEvent({tags: [emojiTag, emojiTag2]})
    const list = await EmojiList.read(event)

    const tmpl = await EmojiList.builder(list).removeEmoji("soapbox").toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "emoji")).toEqual([emojiTag2])
  })

  it("throws on the wrong kind", async () => {
    await expect(EmojiList.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
