import {publish, subscribe} from "@welshman/net"
import type {StampedEvent, TrustedEvent} from "@welshman/util"
import {finalizeEvent} from "nostr-tools/pure"
import {afterAll, beforeEach, describe, expect, it, vi} from "vitest"
import {DVM, type DVMHandler, type DVMOpts} from "../src/handler"
import {now} from "@welshman/lib"

// Mock dependencies
vi.mock("nostr-tools/pure", () => ({
  getPublicKey: vi.fn().mockReturnValue("ee".repeat(32)),
  finalizeEvent: vi.fn(template => ({...template, sig: "ff".repeat(64)})),
}))

vi.mock("@welshman/net", () => ({
  subscribe: vi.fn(),
  publish: vi.fn(),
}))

describe("DVM", () => {
  let dvm: DVM
  let mockHandler: DVMHandler
  let mockSubscription: any
  let mockPublish: any

  const sk = "ff".repeat(32)
  const id = "dd".repeat(32)
  const pubkey = "ee".repeat(32)

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    vi.useFakeTimers()

    // Setup mock handler
    mockHandler = {
      handleEvent: vi.fn().mockImplementation(async function* (e: TrustedEvent) {
        yield {kind: 1, tags: [], content: "response"} as StampedEvent
      }),
    }

    // Setup mock subscription
    mockSubscription = {
      on: vi.fn((event, callback) => {
        if (event === "complete") {
          // Simulate completion after a delay
          setTimeout(callback, 0)
        }
      }),
    }
    vi.mocked(subscribe).mockReturnValue(mockSubscription)

    // Setup mock publish
    mockPublish = {
      emitter: {
        on: vi.fn((event, callback) => {
          if (event === "success") {
            callback()
          }
        }),
      },
    }
    vi.mocked(publish).mockReturnValue(mockPublish)

    // Create DVM instance
    const opts: DVMOpts = {
      sk: sk,
      relays: ["relay1", "relay2"],
      handlers: {
        "1": () => mockHandler,
      },
    }

    dvm = new DVM(opts)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  describe("initialization", () => {
    it("should initialize with provided handlers", () => {
      expect(dvm.handlers.get(1)).toBeDefined()
      expect(dvm.active).toBe(false)
    })

    it("should parse handler kinds as integers", () => {
      const dvm = new DVM({
        sk,
        relays: [],
        handlers: {"1": () => mockHandler},
      })
      expect(dvm.handlers.get(1)).toBeDefined()
    })
  })

  describe("start", () => {
    it("should start subscription with correct filters", async () => {
      await Promise.all([
        dvm.start(),
        vi.advanceTimersByTimeAsync(1000),
        new Promise(resolve => setTimeout(() => resolve(dvm.stop()), 1000)),
      ])

      expect(subscribe).toHaveBeenCalledWith({
        relays: ["relay1", "relay2"],
        filters: [{kinds: [1], since: now()}],
      })
    })

    it("should include pubkey filter when requireMention is true", async () => {
      dvm = new DVM({
        sk,
        relays: ["relay1"],
        handlers: {"1": () => mockHandler},
        requireMention: true,
      })

      await Promise.all([
        dvm.start(),
        vi.advanceTimersByTimeAsync(1000),
        new Promise(resolve => setTimeout(() => resolve(dvm.stop()), 1000)),
      ])

      expect(subscribe).toHaveBeenCalledWith({
        relays: ["relay1"],
        filters: [
          {
            kinds: [1],
            since: now() - 1,
            "#p": [pubkey],
          },
        ],
      })
    })
  })

  describe("event handling", () => {
    it("should ignore duplicate events", async () => {
      const event = {id, kind: 1, tags: [], content: ""} as any

      await dvm.onEvent(event)
      await dvm.onEvent(event)

      expect(mockHandler.handleEvent).toHaveBeenCalledTimes(1)
    })

    it("should ignore events without handlers", async () => {
      const event = {id, kind: 2} as TrustedEvent

      await dvm.onEvent(event)

      expect(mockHandler.handleEvent).not.toHaveBeenCalled()
    })

    it("should add required tags to response events", async () => {
      const request = {
        id,
        kind: 1,
        pubkey,
        tags: [["i", "input123"]],
      } as TrustedEvent

      mockHandler.handleEvent.mockImplementation(async function* () {
        yield {kind: 1, tags: []} as StampedEvent
      })

      await dvm.onEvent(request)

      vi.advanceTimersByTimeAsync(100)

      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            tags: expect.arrayContaining([
              ["request", expect.any(String)],
              ["i", "input123"],
              ["p", pubkey],
              ["e", id],
              ["expiration", (now() + 60 * 60).toString()], // default expireAfter is 1 hour
            ]),
          }),
        }),
      )
    })

    it("should not add request tag to job status events", async () => {
      const request = {
        id,
        kind: 1,
        pubkey,
        tags: [],
      } as any

      mockHandler.handleEvent.mockImplementation(async function* () {
        yield {kind: 7000, tags: []} as StampedEvent
      })

      await dvm.onEvent(request)

      const publishedEvent = vi.mocked(publish).mock.calls[0][0].event
      expect(publishedEvent.tags).not.toContainEqual(expect.arrayContaining(["request"]))
    })

    it("should handle custom expiration time", async () => {
      dvm = new DVM({
        sk,
        relays: ["relay1"],
        handlers: {"1": () => mockHandler},
        expireAfter: 120, // 2 minutes
      })

      const request = {
        id,
        kind: 1,
        pubkey,
        tags: [],
      } as any

      await dvm.onEvent(request)

      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            tags: expect.arrayContaining([["expiration", (now() + 120).toString()]]),
          }),
        }),
      )
    })
  })

  describe("publish", () => {
    it("should finalize and publish events", async () => {
      const template = {
        kind: 1,
        tags: [],
        content: "test",
      } as any

      await dvm.publish(template)

      expect(finalizeEvent).toHaveBeenCalledWith(template, expect.any(Uint8Array))
      expect(publish).toHaveBeenCalledWith({
        event: expect.any(Object),
        relays: ["relay1", "relay2"],
      })
    })
  })

  describe("cleanup", () => {
    it("should stop all handlers", () => {
      const stopHandler = {
        stop: vi.fn(),
        handleEvent: vi.fn(),
      }

      dvm = new DVM({
        sk: sk,
        relays: ["relay1"],
        handlers: {"1": () => stopHandler},
      })

      dvm.stop()

      expect(stopHandler.stop).toHaveBeenCalled()
      expect(dvm.active).toBe(false)
    })
  })

  describe("logging", () => {
    it("should log events when enabled", async () => {
      const consoleSpy = vi.spyOn(console, "info")
      dvm.logEvents = true

      const request = {
        id: "req123",
        kind: 1,
        pubkey: "pub123",
        tags: [],
      } as any

      await dvm.onEvent(request)

      expect(consoleSpy).toHaveBeenCalledWith("Handling request", request)
      expect(consoleSpy).toHaveBeenCalledWith("Publishing event", expect.any(Object))
    })
  })
})
