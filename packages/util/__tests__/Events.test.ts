import {now} from "@welshman/lib"
import {describe, it, expect} from "vitest"
import {verifiedSymbol} from "nostr-tools/pure"
import * as Events from "../src/Events"

describe("Events", () => {
  // Realistic Nostr data
  const pubkey = "ee".repeat(32)
  const sig = "ee".repeat(64)
  const id = "ff".repeat(32)
  const currentTime = now()

  const createBaseEvent = () => ({
    kind: 1,
    content: "Hello Nostr!",
    tags: [["p", pubkey]],
  })

  const createStampedEvent = () => ({
    ...createBaseEvent(),
    created_at: currentTime,
  })

  const createOwnedEvent = () => ({
    ...createStampedEvent(),
    pubkey: pubkey,
  })

  const createHashedEvent = () => ({
    ...createOwnedEvent(),
    id: id,
  })

  const createSignedEvent = () => ({
    ...createHashedEvent(),
    sig: sig,
  })

  describe("makeEvent", () => {
    it("should create event with defaults", () => {
      const event = Events.makeEvent(1, {})
      expect(event.kind).toBe(1)
      expect(event.content).toBe("")
      expect(event.tags).toEqual([])
      expect(event.created_at).toBeLessThanOrEqual(now())
    })

    it("should create event with provided values", () => {
      const event = Events.makeEvent(1, {
        content: "Hello Nostr!",
        tags: [["p", pubkey]],
        created_at: currentTime,
      })
      expect(event).toEqual(createStampedEvent())
    })
  })

  describe("type guards", () => {
    it("should validate EventTemplate", () => {
      expect(Events.isEventTemplate(createBaseEvent())).toBe(true)
      expect(Events.isEventTemplate({kind: 1} as Events.EventTemplate)).toBe(false)
    })

    it("should validate StampedEvent", () => {
      expect(Events.isStampedEvent(createStampedEvent())).toBe(true)
      expect(Events.isStampedEvent(createBaseEvent() as Events.StampedEvent)).toBe(false)
    })

    it("should validate OwnedEvent", () => {
      expect(Events.isOwnedEvent(createOwnedEvent())).toBe(true)
      expect(Events.isOwnedEvent(createStampedEvent() as Events.OwnedEvent)).toBe(false)
    })

    it("should validate HashedEvent", () => {
      expect(Events.isHashedEvent(createHashedEvent())).toBe(true)
      expect(Events.isHashedEvent(createOwnedEvent() as Events.HashedEvent)).toBe(false)
    })

    it("should validate SignedEvent", () => {
      expect(Events.isSignedEvent(createSignedEvent())).toBe(true)
      expect(Events.isSignedEvent(createHashedEvent())).toBe(false)
    })
  })

  describe("event conversion", () => {
    it("should convert to EventTemplate", () => {
      const result = Events.asEventTemplate(createSignedEvent())
      expect(result).toHaveProperty("kind")
      expect(result).toHaveProperty("tags")
      expect(result).toHaveProperty("content")
      expect(result).not.toHaveProperty("created_at")
    })

    it("should convert to StampedEvent", () => {
      const result = Events.asStampedEvent(createSignedEvent())
      expect(result).toHaveProperty("created_at")
      expect(result).not.toHaveProperty("pubkey")
    })

    it("should convert to OwnedEvent", () => {
      const result = Events.asOwnedEvent(createSignedEvent())
      expect(result).not.toHaveProperty("sig")
      expect(result).not.toHaveProperty("id")
    })

    it("should convert to HashedEvent", () => {
      const result = Events.asHashedEvent(createSignedEvent())
      expect(result).not.toHaveProperty("sig")
    })

    it("should convert to SignedEvent", () => {
      const trustedEvent = {
        ...createHashedEvent(),
        sig: sig,
        nonsense: 1,
      }
      const result = Events.asSignedEvent(trustedEvent)
      expect(result).not.toHaveProperty("nonsense")
      expect(result).toHaveProperty("sig")
    })
  })

  describe("signature validation", () => {
    it("should validate signature using verifiedSymbol", () => {
      const event = createSignedEvent() as Events.SignedEvent
      event[verifiedSymbol] = true
      expect(Events.verifyEvent(event)).toBe(true)

      // Clear verifiedSymbol and verify the actual signature
      delete event[verifiedSymbol]
      // the signature is invalid, so verifyEvent should return false
      expect(Events.verifyEvent(event)).toBe(false)
    })
  })

  describe("event identifiers", () => {
    it("should get identifier from d tag", () => {
      const event = {
        ...createBaseEvent(),
        tags: [["d", "test-identifier"]],
      }
      expect(Events.getIdentifier(event)).toBe("test-identifier")
    })

    it("should get address for replaceable events", () => {
      const event = {
        ...createHashedEvent(),
        kind: 10000, // replaceable kind
      }
      expect(Events.getIdOrAddress(event)).toMatch(/^10000:/)
    })
  })

  describe("event type checks", () => {
    it("should identify ephemeral events", () => {
      const event = {
        ...createBaseEvent(),
        kind: 20000, // ephemeral kind
      }
      expect(Events.isEphemeral(event)).toBe(true)
    })

    it("should identify replaceable events", () => {
      const event = {
        ...createBaseEvent(),
        kind: 10000, // replaceable kind
      }
      expect(Events.isReplaceable(event)).toBe(true)
    })

    it("should identify parameterized replaceable events", () => {
      const event = {
        ...createBaseEvent(),
        kind: 30000, // parameterized replaceable kind
      }
      expect(Events.isParameterizedReplaceable(event)).toBe(true)
    })
  })
})
