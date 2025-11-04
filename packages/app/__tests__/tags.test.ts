import {COMMENT, getAddress, MUTES, NOTE} from "@welshman/util"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {
  tagEvent,
  tagEventForComment,
  tagEventForQuote,
  tagEventForReaction,
  tagEventForReply,
  tagEventPubkeys,
  tagPubkey,
  tagZapSplit,
} from "../src/tags"

describe("tags", () => {
  const id = "00".repeat(32)
  const id1 = "11".repeat(32)
  const id2 = "22".repeat(32)

  const pubkey = "aa".repeat(32)
  const pubkey1 = "bb".repeat(32)
  const pubkey2 = "cc".repeat(32)

  const mockEvent: any = {
    id,
    pubkey,
    kind: 1,
    tags: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("tagZapSplit", () => {
    it("should create zap split tag with default split", () => {
      const result = tagZapSplit(pubkey1)
      expect(result).toEqual(["zap", pubkey1, expect.any(String), "1"])
    })

    it("should create zap split tag with custom split", () => {
      const result = tagZapSplit(pubkey1, 0.5)
      expect(result).toEqual(["zap", pubkey1, expect.any(String), "0.5"])
    })
  })

  describe("tagPubkey", () => {
    it("should create pubkey tag with relay hint and display name", () => {
      const result = tagPubkey(pubkey1)
      expect(result).toEqual(["p", pubkey1, expect.any(String), expect.any(String)])
    })
  })

  describe("tagEvent", () => {
    it("should create basic event tag", () => {
      const result = tagEvent(mockEvent)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(["e", mockEvent.id, expect.any(String), "", mockEvent.pubkey])
    })

    it("should include address tag for replaceable events", () => {
      const replaceableEvent = {...mockEvent, kind: MUTES}
      const result = tagEvent(replaceableEvent)
      expect(result).toHaveLength(2)
      expect(result[1][0]).toBe("a")
    })
  })

  describe("tagEventPubkeys", () => {
    it("should extract and tag unique pubkeys from event", () => {
      const event = {
        ...mockEvent,
        tags: [
          ["p", pubkey1],
          ["p", pubkey2],
        ],
      }
      const result = tagEventPubkeys(event)
      expect(result).toHaveLength(3) // event.pubkey + 2 tagged pubkeys
      expect(result.every(tag => tag[0] === "p")).toBe(true)
    })
  })

  describe("tagEventForQuote", () => {
    it("should create quote tag", () => {
      const result = tagEventForQuote(mockEvent)
      expect(result).toEqual(["q", mockEvent.id, expect.any(String), mockEvent.pubkey])
    })
  })

  describe("tagEventForReply", () => {
    it("should handle reply to event with no existing tags", () => {
      const result = tagEventForReply(mockEvent)
      expect(result.some(tag => tag[0] === "e")).toBe(true)
      expect(result.some(tag => tag[3] === "root")).toBe(true)
    })

    it("should handle reply to event with root", () => {
      const eventWithRoot = {
        ...mockEvent,
        tags: [
          ["e", id1, "", "root"],
          ["p", pubkey1],
        ],
      }
      const result = tagEventForReply(eventWithRoot)
      const p = result.filter(tag => tag[0] === "p")
      const e = result.filter(tag => tag[0] === "e")
      // p[0] should be the author of the event
      expect(p[0][1]).toBe(pubkey)
      // p[1] should be the pubkey mentioned in the event
      expect(p[1][1]).toBe(pubkey1)
      // e[0] the "e" root tag should have been propagated
      expect(e[0][1]).toBe(id1)
      // e[1] should be the event id
      expect(e[1][1]).toBe(id)
    })

    it("should handle replaceable events", () => {
      const replaceableEvent = {
        ...mockEvent,
        kind: MUTES,
        tags: [
          ["e", id1, "relay-url", "root"],
          ["e", id2, "relay-url", "mention"],
        ],
      }
      const result = tagEventForReply(replaceableEvent)

      const p = result.filter(tag => tag[0] === "p")
      const e = result.filter(tag => tag[0] === "e")
      const a = result.filter(tag => tag[0] === "a")

      // p[0] should be the author of the event
      expect(p[0][1]).toBe(pubkey)
      // e[0] should be the root propagated
      expect(e[0][1]).toBe(id1)
      expect(e[0][3]).toBe("root")
      // e[1] should be the event id and marked as a reply
      expect(e[1][1]).toBe(id)
      expect(e[1][3]).toBe("reply")

      // a[0] should be the address of the replaceable event
      expect(a[0][1]).toBe(getAddress(replaceableEvent))
    })
  })

  describe("tagEventForComment", () => {
    it("should create comment tags for basic event", () => {
      const result = tagEventForComment(mockEvent)
      expect(result.some(tag => tag[0] === "K")).toBe(true)
      expect(result.some(tag => tag[0] === "P")).toBe(true)
      expect(result.some(tag => tag[0] === "E")).toBe(true)
    })

    it("should handle replaceable events", () => {
      const replaceableEvent = {...mockEvent, kind: MUTES}
      const result = tagEventForComment(replaceableEvent)
      expect(result.some(tag => tag[0] === "A")).toBe(true)
      expect(result.some(tag => tag[0] === "a")).toBe(true)
    })

    it("should preserve root tags and point to the direct parent", () => {
      const eventWithTags = {
        ...mockEvent,
        kind: COMMENT,
        tags: [
          ["e", id2, "relay-url", "root"],
          ["p", pubkey2, "relay-url"],
          ["k", NOTE.toString()],
          ["E", id1, "relay-url", "root"],
          ["P", pubkey1, "relay-url"],
          ["K", NOTE.toString()],
        ],
      }
      const result = tagEventForComment(eventWithTags)

      // Should preserve uppercase variants of existing tags
      // expect(result.some(tag => tag[0] === "E" && tag[1] === id1)).toBe(true)
      // expect(result.some(tag => tag[0] === "P" && tag[1] === pubkey1)).toBe(true)
      // expect(result.some(tag => tag[0] === "K" && tag[1] === NOTE.toString())).toBe(true)

      // Should also add lowercase variants
      expect(result.some(tag => tag[0] === "e" && tag[1] === eventWithTags.id)).toBe(true)
      expect(result.some(tag => tag[0] === "p" && tag[1] === eventWithTags.pubkey)).toBe(true)
      expect(result.some(tag => tag[0] === "k" && tag[1] === COMMENT.toString())).toBe(true)
    })

    it("should handle events with multiple root tags", () => {
      const eventWithMultipleRoots = {
        ...mockEvent,
        tags: [
          ["e", id1, "relay-url", "root"],
          ["e", id2, "relay-url", "root"],
        ],
      }
      const result = tagEventForComment(eventWithMultipleRoots)

      expect(result).toEqual([
        ["K", String(NOTE)],
        ["P", pubkey, expect.any(String)],
        ["E", id, expect.any(String), pubkey],
        ["k", String(NOTE)],
        ["p", pubkey, expect.any(String)],
        ["e", id, expect.any(String), pubkey],
      ])
    })

    it("should handle events with mixed tag types", () => {
      const eventWithMixedTags = {
        ...mockEvent,
        kind: MUTES,
        tags: [
          ["e", id, "relay-url", "root"],
          ["p", pubkey1, "relay-url"],
          ["i", id1],
          ["a", "some-address", "relay-url"],
          ["custom", "value"],
        ],
      }
      const result = tagEventForComment(eventWithMixedTags)

      expect(result).toEqual([
        ["K", String(MUTES)],
        ["P", pubkey, expect.any(String)],
        ["E", id, expect.any(String), pubkey],
        ["A", getAddress(eventWithMixedTags), expect.any(String), pubkey],
        ["k", String(MUTES)],
        ["p", pubkey, expect.any(String)],
        ["e", id, expect.any(String), pubkey],
        ["a", getAddress(eventWithMixedTags), expect.any(String), pubkey],
      ])
    })

    it("should add event metadata tags when no root tags exist", () => {
      const eventWithoutRoots = {
        ...mockEvent,
        tags: [["custom", "value"]],
      }
      const result = tagEventForComment(eventWithoutRoots)

      // Should add uppercase metadata tags (roots)
      expect(result.some(tag => tag[0] === "K" && tag[1] === String(mockEvent.kind))).toBe(true)
      expect(result.some(tag => tag[0] === "P" && tag[1] === mockEvent.pubkey)).toBe(true)
      expect(result.some(tag => tag[0] === "E" && tag[1] === mockEvent.id)).toBe(true)

      // Should add lowercase variants (parents)
      expect(result.some(tag => tag[0] === "k" && tag[1] === String(mockEvent.kind))).toBe(true)
      expect(result.some(tag => tag[0] === "p" && tag[1] === mockEvent.pubkey)).toBe(true)
      expect(result.some(tag => tag[0] === "e" && tag[1] === mockEvent.id)).toBe(true)
    })
  })

  describe("tagEventForReaction", () => {
    it("should create reaction tags", () => {
      const result = tagEventForReaction(mockEvent)
      expect(result.some(tag => tag[0] === "k")).toBe(true)
      expect(result.some(tag => tag[0] === "e")).toBe(true)
    })

    it("should include author tag if different from current user", () => {
      const result = tagEventForReaction(mockEvent)
      expect(result.some(tag => tag[0] === "p")).toBe(true)
    })

    it("should handle replaceable events", () => {
      const replaceableEvent = {...mockEvent, kind: MUTES}
      const result = tagEventForReaction(replaceableEvent)
      expect(result.some(tag => tag[0] === "a")).toBe(true)
    })
  })
})
