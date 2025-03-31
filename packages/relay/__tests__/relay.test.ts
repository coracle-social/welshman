import {now} from "@welshman/lib"
import {describe, it, expect, beforeEach, vi, afterEach} from "vitest"
import {
  Relay,
  normalizeRelayUrl,
  isRelayUrl,
  isOnionUrl,
  isLocalUrl,
  isIPAddress,
  isShareableRelayUrl,
  displayRelayUrl,
  displayRelayProfile,
} from "../src/Relay"
import {Repository} from "../src/Repository"
import type {TrustedEvent} from "../src/Events"

describe("Relay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Realistic Nostr data
  const pubkey = "ee".repeat(32)
  const id = "ff".repeat(32)
  const sig = "00".repeat(64)
  const currentTime = now()
  const onionUrl = "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion"

  const createEvent = (overrides = {}): TrustedEvent => ({
    id: id,
    pubkey: pubkey,
    created_at: currentTime,
    kind: 1,
    tags: [],
    content: "Hello Nostr!",
    sig: sig,
    ...overrides,
  })

  describe("URL utilities", () => {
    describe("isRelayUrl", () => {
      it("should validate proper relay URLs", () => {
        expect(isRelayUrl("wss://relay.example.com")).toBe(true)
        expect(isRelayUrl("ws://relay.example.com")).toBe(true)
        expect(isRelayUrl("relay.example.com")).toBe(true)
      })

      it("should reject invalid URLs", () => {
        expect(isRelayUrl("http://relay.example.com")).toBe(false)
        expect(isRelayUrl("not-a-url")).toBe(false)
        expect(isRelayUrl("ws:\\example.com\\path\\to\\file.ext")).toBe(false)
      })
    })

    describe("isOnionUrl", () => {
      it("should validate onion URLs", () => {
        expect(isOnionUrl(onionUrl)).toBe(true)
      })

      it("should reject non-onion URLs", () => {
        expect(isOnionUrl("wss://relay.example.com")).toBe(false)
      })
    })

    describe("isLocalUrl", () => {
      it("should validate local URLs", () => {
        expect(isLocalUrl("wss://relay.local")).toBe(true)
        expect(isLocalUrl("ws://localhost:8080")).toBe(true)
      })

      it("should reject non-local URLs", () => {
        expect(isLocalUrl("wss://relay.example.com")).toBe(false)
      })
    })

    describe("isIPAddress", () => {
      it("should validate IP addresses", () => {
        expect(isIPAddress("wss://192.168.1.1")).toBe(true)
      })

      it("should reject domains", () => {
        expect(isIPAddress("wss://relay.example.com")).toBe(false)
      })
    })

    describe("isShareableRelayUrl", () => {
      it("should validate shareable URLs", () => {
        expect(isShareableRelayUrl("wss://relay.example.com")).toBe(true)
      })

      it("should reject local URLs", () => {
        expect(isShareableRelayUrl("wss://relay.local")).toBe(false)
      })
    })

    describe("normalizeRelayUrl", () => {
      it("should normalize URLs consistently", () => {
        expect(normalizeRelayUrl("relay.example.com")).toBe("wss://relay.example.com/")
        expect(normalizeRelayUrl("wss://RELAY.EXAMPLE.COM")).toBe("wss://relay.example.com/")
      })

      it("should handle onion URLs", () => {
        expect(normalizeRelayUrl(onionUrl)).toBe(`ws://${onionUrl}/`)
      })
    })

    describe("displayRelayUrl", () => {
      it("should format URLs for display", () => {
        expect(displayRelayUrl("wss://relay.example.com/")).toBe("relay.example.com")
      })
    })

    describe("displayRelayProfile", () => {
      it("should display profile name when available", () => {
        const profile = {url: "wss://relay.example.com", name: "Test Relay"}
        expect(displayRelayProfile(profile)).toBe("Test Relay")
      })

      it("should use fallback when no name", () => {
        const profile = {url: "wss://relay.example.com"}
        expect(displayRelayProfile(profile, "Fallback")).toBe("Fallback")
      })
    })
  })

  describe("Relay class", () => {
    let relay: Relay
    let repository: Repository<TrustedEvent>

    beforeEach(() => {
      repository = new Repository<TrustedEvent>()
      relay = new Relay(repository)
    })

    describe("EVENT handling", () => {
      it("should publish events to repository", async () => {
        const event = createEvent()
        const publishSpy = vi.spyOn(repository, "publish")

        relay.send("EVENT", event)

        expect(publishSpy).toHaveBeenCalledWith(event)

        // Should emit OK
        const okHandler = vi.fn()
        relay.on("OK", okHandler)

        // Wait for async operations
        await vi.runAllTimersAsync()

        expect(okHandler).toHaveBeenCalledWith(event.id, true, "")
      })

      it("should notify matching subscribers", async () => {
        const event = createEvent()
        const subId = "test-sub"
        const filter = {kinds: [1]}

        relay.send("REQ", subId, filter)

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledWith(subId, event)
      })

      it("should not notify for deleted events", async () => {
        const event = createEvent()
        repository.removeEvent(event.id)

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).not.toHaveBeenCalled()
      })
    })

    describe("REQ handling", () => {
      it("should handle subscription requests", async () => {
        const event = createEvent()
        repository.publish(event)

        const subId = "test-sub"
        const filter = {kinds: [1]}

        const eventHandler = vi.fn()
        const eoseHandler = vi.fn()

        relay.on("EVENT", eventHandler)
        relay.on("EOSE", eoseHandler)

        relay.send("REQ", subId, filter)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledWith(subId, event)
        expect(eoseHandler).toHaveBeenCalledWith(subId)
      })

      it("should handle multiple filters", async () => {
        const event1 = createEvent({kind: 1})
        const event2 = createEvent({kind: 2, id: "ee".repeat(31)})
        repository.publish(event1)
        repository.publish(event2)

        const subId = "test-sub"
        const filters = [{kinds: [1]}, {kinds: [2]}]

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("REQ", subId, ...filters)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledTimes(2)
      })
    })

    describe("CLOSE handling", () => {
      it("should close subscriptions", async () => {
        const subId = "test-sub"
        relay.send("REQ", subId, {kinds: [1]})
        relay.send("CLOSE", subId)

        await vi.runAllTimersAsync()

        const event = createEvent()
        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).not.toHaveBeenCalled()
      })
    })
  })
})
