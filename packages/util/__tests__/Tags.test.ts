import {describe, it, expect} from "vitest"
import {
  tagSpec,
  hexTags,
  kindTags,
  topicTags,
  addressTags,
  relayTags,
  matchTag,
  matchTags,
  tagValue,
  tagValues,
} from "../src/Tags"

const pubkey = "ee".repeat(32)
const eventId = "ff".repeat(32)
const address = `30023:${pubkey}:test`

describe("Tags", () => {
  const tags = [
    ["p", pubkey],
    ["e", eventId],
    ["t", "test"],
  ]

  describe("selection", () => {
    it("matchTags/matchTag select by key", () => {
      expect(matchTags(tagSpec("p"), tags)).toEqual([["p", pubkey]])
      expect(matchTags(tagSpec(["p", "e"]), tags)).toHaveLength(2)
      expect(matchTag(tagSpec("p"), tags)).toEqual(["p", pubkey])
      expect(matchTag(tagSpec("x"), tags)).toBeUndefined()
    })

    it("tagValues/tagValue read t[1]", () => {
      expect(tagValues(tagSpec("p"), tags)).toEqual([pubkey])
      expect(tagValue(tagSpec("p"), tags)).toBe(pubkey)
      expect(tagValue(tagSpec("x"), tags)).toBeUndefined()
    })
  })

  describe("value-typed specs", () => {
    it("hexTags matches 32-byte hex values", () => {
      const t = [
        ["e", eventId],
        ["e", "invalid"],
        ["other", eventId],
      ]

      expect(matchTags(hexTags("e"), t)).toEqual([["e", eventId]])
      expect(tagValues(hexTags("e"), t)).toEqual([eventId])
    })

    it("addressTags matches replaceable addresses", () => {
      const t = [
        ["a", address],
        ["a", "invalid"],
        ["other", address],
      ]

      expect(tagValues(addressTags("a"), t)).toEqual([address])
    })

    it("topicTags strips a leading #", () => {
      const t = [
        ["t", "topic1"],
        ["t", "#topic2"],
        ["other", "topic3"],
      ]

      expect(matchTags(topicTags("t"), t)).toHaveLength(2)
      expect(tagValues(topicTags("t"), t)).toEqual(["topic1", "topic2"])
    })

    it("relayTags matches relay urls across r/relay keys and normalizes them", () => {
      const t = [
        ["r", "wss://relay.example.com"],
        ["relay", "wss://Relay2.Example.com/"],
        ["r", "invalid"],
        ["other", "wss://relay.example.com"],
      ]

      expect(tagValues(relayTags(["r", "relay"]), t)).toEqual([
        "wss://relay.example.com/",
        "wss://relay2.example.com/",
      ])
    })

    it("kindTags matches numeric kinds and reads them as numbers", () => {
      const t = [
        ["k", "1"],
        ["k", "invalid"],
        ["other", "1"],
      ]

      expect(matchTags(kindTags("k"), t)).toHaveLength(1)
      expect(tagValues(kindTags("k"), t)).toEqual([1])
    })
  })
})
