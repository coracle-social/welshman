import {now} from "@welshman/lib"
import {HANDLER_INFORMATION} from "@welshman/util"
import {describe, it, vi, expect, beforeEach} from "vitest"
import {readHandlers, getHandlerKey, displayHandler, getHandlerAddress} from "../src/Handler"
import type {TrustedEvent} from "../src/Events"

describe("Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const pubkey = "ee".repeat(32)
  const id = "ff".repeat(32)
  const currentTime = now()

  const createHandlerEvent = (overrides = {}): TrustedEvent => ({
    id: id,
    pubkey: pubkey,
    created_at: currentTime,
    kind: HANDLER_INFORMATION,
    tags: [
      ["d", "test-handler"],
      ["k", "30023"],
      ["k", "30024"],
    ],
    content: JSON.stringify({
      name: "Test Handler",
      image: "https://example.com/image.jpg",
      about: "Test handler description",
      website: "https://example.com",
      lud16: "user@domain.com",
      nip05: "user@domain.com",
    }),
    ...overrides,
  })

  describe("readHandlers", () => {
    it("should parse valid handler event with full metadata", () => {
      const event = createHandlerEvent()
      const handlers = readHandlers(event)

      expect(handlers).toHaveLength(2) // Two k tags
      expect(handlers[0]).toMatchObject({
        kind: 30023,
        identifier: "test-handler",
        name: "Test Handler",
        image: "https://example.com/image.jpg",
        about: "Test handler description",
        website: "https://example.com",
        lud16: "user@domain.com",
        nip05: "user@domain.com",
      })
    })

    it("should handle display_name and picture alternatives", () => {
      const event = createHandlerEvent({
        content: JSON.stringify({
          display_name: "Test Handler",
          picture: "https://example.com/image.jpg",
          about: "Test description",
        }),
      })
      const handlers = readHandlers(event)

      expect(handlers[0].name).toBe("Test Handler")
      expect(handlers[0].image).toBe("https://example.com/image.jpg")
    })

    it("should return empty array if name is missing", () => {
      const event = createHandlerEvent({
        content: JSON.stringify({
          image: "https://example.com/image.jpg",
          about: "Test description",
        }),
      })
      const handlers = readHandlers(event)

      expect(handlers).toEqual([])
    })

    it("should return empty array if image is missing", () => {
      const event = createHandlerEvent({
        content: JSON.stringify({
          name: "Test Handler",
          about: "Test description",
        }),
      })
      const handlers = readHandlers(event)

      expect(handlers).toEqual([])
    })

    it("should handle invalid JSON content", () => {
      const event = createHandlerEvent({
        content: "invalid json",
      })
      const handlers = readHandlers(event)

      expect(handlers).toEqual([])
    })

    it("should handle empty content", () => {
      const event = createHandlerEvent({
        content: "",
      })
      const handlers = readHandlers(event)

      expect(handlers).toEqual([])
    })

    it("should handle missing optional fields", () => {
      const event = createHandlerEvent({
        content: JSON.stringify({
          name: "Test Handler",
          image: "https://example.com/image.jpg",
        }),
      })
      const handlers = readHandlers(event)

      expect(handlers[0]).toMatchObject({
        name: "Test Handler",
        image: "https://example.com/image.jpg",
        about: "",
        website: "",
        lud16: "",
        nip05: "",
      })
    })
  })

  describe("getHandlerKey", () => {
    it("should generate correct handler key", () => {
      const event = createHandlerEvent()
      const handler = readHandlers(event)[0]
      const key = getHandlerKey(handler)

      expect(key).toBe(`30023:31990:${pubkey}:test-handler`)
    })
  })

  describe("displayHandler", () => {
    it("should return handler name when available", () => {
      const event = createHandlerEvent()
      const handler = readHandlers(event)[0]

      expect(displayHandler(handler)).toBe("Test Handler")
    })

    it("should return fallback when handler is undefined", () => {
      expect(displayHandler(undefined, "Fallback")).toBe("Fallback")
    })

    it("should return empty string when no fallback provided", () => {
      expect(displayHandler(undefined)).toBe("")
    })
  })

  describe("getHandlerAddress", () => {
    it("should return web-tagged address if available", () => {
      const event = createHandlerEvent({
        tags: [
          ["a", "30023:pubkey1:test", "relay1", "web"],
          ["a", "30024:pubkey2:test", "relay2"],
        ],
      })

      expect(getHandlerAddress(event)).toBe("30023:pubkey1:test")
    })

    it("should return first address if no web tag", () => {
      const event = createHandlerEvent({
        tags: [
          ["a", "30023:pubkey1:test", "relay1"],
          ["a", "30024:pubkey2:test", "relay2"],
        ],
      })

      expect(getHandlerAddress(event)).toBe("30023:pubkey1:test")
    })

    it("should return undefined if no address tags", () => {
      const event = createHandlerEvent({
        tags: [["d", "test-handler"]],
      })

      expect(getHandlerAddress(event)).toBeUndefined()
    })

    it("should handle empty tags array", () => {
      const event = createHandlerEvent({
        tags: [],
      })

      expect(getHandlerAddress(event)).toBeUndefined()
    })
  })
})
