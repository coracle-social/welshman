import {now} from "@welshman/lib"
import {MUTES} from "@welshman/util"
import {describe, it, vi, expect, beforeEach} from "vitest"
import {
  makeList,
  readList,
  getListTags,
  removeFromList,
  removeFromListByPredicate,
  addToListPublicly,
  addToListPrivately,
} from "../src/List"
import type {DecryptedEvent} from "../src/Encryptable"
import type {List} from "../src/List"

describe("List", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pubkey = "ee".repeat(32)
  const validEventId = "ff".repeat(32)
  const address = `30023:${pubkey}:test`
  const currentTime = now()

  const createDecryptedEvent = (overrides = {}): DecryptedEvent => ({
    id: validEventId,
    pubkey: pubkey,
    created_at: currentTime,
    kind: MUTES,
    tags: [],
    content: "",
    plaintext: {},
    ...overrides,
  })

  describe("makeList", () => {
    it("should create a list with defaults", () => {
      const list = makeList({kind: MUTES})
      expect(list).toEqual({
        kind: MUTES,
        publicTags: [],
        privateTags: [],
      })
    })

    it("should preserve existing tags", () => {
      const list = makeList({
        kind: MUTES,
        publicTags: [["p", pubkey]],
        privateTags: [["e", validEventId]],
      })
      expect(list.publicTags).toHaveLength(1)
      expect(list.privateTags).toHaveLength(1)
    })
  })

  describe("readList", () => {
    it("should parse valid public tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["p", pubkey],
          ["e", validEventId],
          ["a", address],
          ["t", "test"],
          ["r", "wss://relay.example.com"],
          ["relay", "wss://relay.example.com"],
          ["unknown", "value"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(7)
    })

    it("should not parse invalid public tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["p", "invalid-pubkey"],
          ["e", "invalid-event-id"],
          ["a", "invalid-address"],
          ["t", ""],
          ["r", "invalid-url"],
          ["relay", "invalid-url"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(0)
    })

    it("should parse valid private tags", () => {
      const event = createDecryptedEvent({
        plaintext: {
          content: JSON.stringify([
            ["p", pubkey],
            ["e", validEventId],
          ]),
        },
      })
      const list = readList(event)
      expect(list.privateTags).toHaveLength(2)
    })

    it("should not parse invalid private tags", () => {
      const event = createDecryptedEvent({
        plaintext: {
          content: JSON.stringify([
            ["p", "invalid-pubkey"],
            ["e", "invalid-event-id"],
          ]),
        },
      })
      const list = readList(event)
      expect(list.privateTags).toHaveLength(0)
    })

    it("should filter invalid tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["p", "invalid-pubkey"],
          ["e", "invalid-event-id"],
          ["a", "invalid-address"],
          ["t", ""],
          ["r", "invalid-url"],
          ["relay", "invalid-url"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(0)
    })

    it("should handle invalid JSON in private content", () => {
      const event = createDecryptedEvent({
        plaintext: {content: "invalid-json"},
      })
      const list = readList(event)
      expect(list.privateTags).toEqual([])
    })

    it("should handle non-array private content", () => {
      const event = createDecryptedEvent({
        plaintext: {content: JSON.stringify({not: "an-array"})},
      })
      const list = readList(event)
      expect(list.privateTags).toEqual([])
    })
  })

  describe("getListTags", () => {
    it("should combine public and private tags", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [["p", pubkey]],
        privateTags: [["e", validEventId]],
      }
      const tags = getListTags(list)
      expect(tags).toHaveLength(2)
    })

    it("should handle undefined list", () => {
      expect(getListTags(undefined)).toEqual([])
    })
  })

  describe("removeFromList", () => {
    it("should remove matching public tags", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [["p", pubkey]],
        privateTags: [],
        event: createDecryptedEvent(),
      }
      const result = removeFromList(list, pubkey)
      expect(result.event.tags).toHaveLength(0)
    })

    it("should remove matching private tags", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [],
        privateTags: [["p", pubkey]],
        event: createDecryptedEvent(),
      }
      const result = removeFromList(list, pubkey)
      const plaintext = JSON.parse(result.updates.content || "[]")
      expect(plaintext).toHaveLength(0)
    })
  })

  describe("removeFromListByPredicate", () => {
    it("should remove tags matching predicate", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [
          ["p", pubkey],
          ["e", validEventId],
        ],
        privateTags: [["p", pubkey]],
        event: createDecryptedEvent(),
      }
      const result = removeFromListByPredicate(list, tag => tag[0] === "p")
      expect(result.event.tags).toHaveLength(1)
      const plaintext = JSON.parse(result.updates.content || "[]")
      expect(plaintext).toHaveLength(0)
    })
  })

  describe("addToListPublicly", () => {
    it("should add tags to public list", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [],
        privateTags: [],
        event: createDecryptedEvent(),
      }
      const result = addToListPublicly(list, ["p", pubkey])
      expect(result.event.tags).toHaveLength(1)
      expect(result.updates).toEqual({})
    })

    it("should deduplicate tags", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [["p", pubkey]],
        privateTags: [],
        event: createDecryptedEvent(),
      }
      const result = addToListPublicly(list, ["p", pubkey])
      expect(result.event.tags).toHaveLength(1)
    })
  })

  describe("addToListPrivately", () => {
    it("should add tags to private list", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [],
        privateTags: [],
        event: createDecryptedEvent(),
      }
      const result = addToListPrivately(list, ["p", pubkey])
      const plaintext = JSON.parse(result.updates.content || "[]")
      expect(plaintext).toHaveLength(1)
    })

    it("should deduplicate private tags", () => {
      const list: List = {
        kind: MUTES,
        publicTags: [],
        privateTags: [["p", pubkey]],
        event: createDecryptedEvent(),
      }
      const result = addToListPrivately(list, ["p", pubkey])
      const plaintext = JSON.parse(result.updates.content || "[]")
      expect(plaintext).toHaveLength(1)
    })
  })

  describe("tag validation", () => {
    it("should validate pubkey tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["p", pubkey],
          ["p", "invalid"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(1)
    })

    it("should validate event tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["e", validEventId],
          ["e", "invalid"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(1)
    })

    it("should validate address tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["a", address],
          ["a", "invalid"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(1)
    })

    it("should validate topic tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["t", "valid-topic"],
          ["t", ""],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(1)
    })

    it("should validate relay tags", () => {
      const event = createDecryptedEvent({
        tags: [
          ["r", "wss://relay.example.com"],
          ["r", "invalid"],
          ["relay", "wss://relay.example.com"],
          ["relay", "invalid"],
        ],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(2)
    })

    it("should accept unknown tag types", () => {
      const event = createDecryptedEvent({
        tags: [["unknown", "value"]],
      })
      const list = readList(event)
      expect(list.publicTags).toHaveLength(1)
    })
  })
})
