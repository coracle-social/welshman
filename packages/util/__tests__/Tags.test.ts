import {describe, it, vi, expect, beforeEach} from "vitest"
import * as Tags from "../src/Tags"

describe("Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pubkey = "ee".repeat(32)
  const eventId = "ff".repeat(32)
  const address = `30023:${pubkey}:test`

  describe("basic tag operations", () => {
    it("should get tags by type", () => {
      const tags = [
        ["p", pubkey],
        ["e", eventId],
        ["t", "test"],
      ]

      expect(Tags.getTags("p", tags)).toHaveLength(1)
      expect(Tags.getTags(["p", "e"], tags)).toHaveLength(2)
    })

    it("should get single tag by type", () => {
      const tags = [
        ["p", pubkey],
        ["e", eventId],
      ]

      expect(Tags.getTag("p", tags)).toEqual(["p", pubkey])
      expect(Tags.getTag(["p", "e"], tags)).toBeDefined()
    })

    it("should get tag values", () => {
      const tags = [
        ["p", pubkey],
        ["e", eventId],
      ]

      expect(Tags.getTagValues("p", tags)).toEqual([pubkey])
      expect(Tags.getTagValue("p", tags)).toBe(pubkey)
    })
  })

  describe("specific tag types", () => {
    describe("event tags", () => {
      it("should get valid event tags", () => {
        const tags = [
          ["e", eventId],
          ["e", "invalid"],
          ["other", eventId],
        ]

        const eventTags = Tags.getEventTags(tags)
        expect(eventTags).toHaveLength(1)
        expect(Tags.getEventTagValues(tags)).toEqual([eventId])
      })
    })

    describe("address tags", () => {
      it("should get valid address tags", () => {
        const tags = [
          ["a", address],
          ["a", "invalid"],
          ["other", address],
        ]

        const addressTags = Tags.getAddressTags(tags)
        expect(addressTags).toHaveLength(1)
        expect(Tags.getAddressTagValues(tags)).toEqual([address])
      })
    })

    describe("pubkey tags", () => {
      it("should get valid pubkey tags", () => {
        const tags = [
          ["p", pubkey],
          ["p", "invalid"],
          ["other", pubkey],
        ]

        const pubkeyTags = Tags.getPubkeyTags(tags)
        expect(pubkeyTags).toHaveLength(1)
        expect(Tags.getPubkeyTagValues(tags)).toEqual([pubkey])
      })
    })

    describe("topic tags", () => {
      it("should get topic tags", () => {
        const tags = [
          ["t", "topic1"],
          ["t", "#topic2"],
          ["other", "topic3"],
        ]

        const topicTags = Tags.getTopicTags(tags)
        expect(topicTags).toHaveLength(2)
        expect(Tags.getTopicTagValues(tags)).toEqual(["topic1", "topic2"])
      })
    })

    describe("relay tags", () => {
      it("should get valid relay tags", () => {
        const tags = [
          ["r", "wss://relay.example.com"],
          ["relay", "wss://relay2.example.com"],
          ["r", "invalid"],
          ["other", "wss://relay.example.com"],
        ]

        const relayTags = Tags.getRelayTags(tags)
        expect(relayTags).toHaveLength(2)
        expect(Tags.getRelayTagValues(tags)).toEqual([
          "wss://relay.example.com",
          "wss://relay2.example.com",
        ])
      })
    })

    describe("group tags", () => {
      it("should get valid group tags", () => {
        const tags = [
          ["h", "group1", "wss://relay.example.com"],
          ["group", "group2", "wss://relay.example.com"],
          ["h", "invalid"],
          ["other", "group3", "wss://relay.example.com"],
        ]

        const groupTags = Tags.getGroupTags(tags)
        expect(groupTags).toHaveLength(2)
        expect(Tags.getGroupTagValues(tags)).toEqual(["group1", "group2"])
      })
    })

    describe("kind tags", () => {
      it("should get valid kind tags", () => {
        const tags = [
          ["k", "1"],
          ["k", "invalid"],
          ["other", "1"],
        ]

        const kindTags = Tags.getKindTags(tags)
        expect(kindTags).toHaveLength(1)
        expect(Tags.getKindTagValues(tags)).toEqual([1])
      })
    })
  })

  describe("comment and reply tags", () => {
    describe("comment tags", () => {
      it("should separate root and reply tags", () => {
        const tags = [
          ["E", eventId],
          ["e", eventId],
          ["P", pubkey],
          ["p", pubkey],
          ["K", "1"],
          ["k", "1"],
        ]

        const {roots, replies} = Tags.getCommentTags(tags)
        expect(roots).toHaveLength(3)
        expect(replies).toHaveLength(3)

        const values = Tags.getCommentTagValues(tags)
        expect(values.roots).toContain(eventId)
        expect(values.replies).toContain(eventId)
      })
    })

    describe("reply tags", () => {
      it("should handle root replies", () => {
        const tags = [
          ["e", eventId, "", "root"],
          ["e", eventId, "", "reply"],
          ["q", eventId],
        ]

        const {roots, replies, mentions} = Tags.getReplyTags(tags)
        expect(roots).toHaveLength(1)
        expect(replies).toHaveLength(1)
        expect(mentions).toHaveLength(1)
      })

      it("should handle implicit positions", () => {
        const tags = [
          ["e", eventId],
          ["e", eventId],
          ["e", eventId],
        ]

        const {roots, replies, mentions} = Tags.getReplyTags(tags)
        expect(roots).toHaveLength(1)
        expect(replies).toHaveLength(1)
        expect(mentions).toHaveLength(1)
      })

      it("should handle address tags", () => {
        const tags = [
          ["a", address, "", "root"],
          ["a", address, "", "reply"],
        ]

        const {roots, replies} = Tags.getReplyTags(tags)
        expect(roots).toHaveLength(1)
        expect(replies).toHaveLength(1)
      })
    })
  })

  describe("tag utilities", () => {
    it("should deduplicate tags", () => {
      const tags = [
        ["p", pubkey],
        ["p", pubkey],
        ["p", pubkey, "extra"],
      ]

      const unique = Tags.uniqTags(tags)
      expect(unique).toHaveLength(1)
    })

    it("should parse iMeta format", () => {
      const imeta = [`p ${pubkey}`]
      const tags = Tags.tagsFromIMeta(imeta)
      expect(tags).toHaveLength(1)
      expect(tags[0]).toEqual(["p", pubkey])
    })
  })
})
