import {now} from "@welshman/lib"
import {subscribe, publish, SubscriptionEvent} from "@welshman/net"
import type {SignedEvent, TrustedEvent} from "@welshman/util"
import {vi, describe, it, expect, beforeEach} from "vitest"
import {makeDvmRequest, DVMEvent} from "../src/request"

// Mock dependencies
vi.mock(import("@welshman/lib"), async importOriginal => ({
  ...(await importOriginal()),
  Emitter: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
    on: vi.fn(),
  })),
}))

vi.mock("@welshman/net", () => ({
  subscribe: vi.fn(),
  publish: vi.fn(),
  SubscriptionEvent: {
    Event: "event",
  },
}))

describe("DVM Request", () => {
  let mockSubscription: any
  let mockPublish: any
  let baseEvent: SignedEvent

  const id = "dd".repeat(32)
  const pubkey = "ee".repeat(32)
  const sig = "ff".repeat(64)

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock subscription
    mockSubscription = {
      on: vi.fn(),
      close: vi.fn(),
    }
    vi.mocked(subscribe).mockReturnValue(mockSubscription)

    // Setup mock publish
    mockPublish = {
      emitter: {on: vi.fn()},
    }
    vi.mocked(publish).mockReturnValue(mockPublish)

    // Base event for testing
    baseEvent = {
      id,
      kind: 5000,
      pubkey,
      content: "",
      tags: [],
      created_at: now(),
      sig,
    }
  })

  describe("makeDvmRequest", () => {
    it("should create subscription with correct filters", () => {
      const request = makeDvmRequest({
        event: baseEvent,
        relays: ["relay1", "relay2"],
      })

      expect(subscribe).toHaveBeenCalledWith({
        relays: ["relay1", "relay2"],
        timeout: 30000,
        filters: [
          {
            kinds: [6000, 7000], // kind + 1000 and progress events
            since: now() - 60, // now() - 60
            "#e": [id],
          },
        ],
      })
    })

    it("should respect custom timeout", () => {
      const request = makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
        timeout: 5000,
      })

      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        }),
      )
    })

    it("should disable progress events when reportProgress is false", () => {
      makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
        reportProgress: false,
      })

      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: [
            {
              kinds: [6000], // Only result kind, no progress events
              since: expect.any(Number),
              "#e": [baseEvent.id],
            },
          ],
        }),
      )
    })

    it("should publish request event", () => {
      makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
      })

      expect(publish).toHaveBeenCalledWith({
        event: baseEvent,
        relays: ["relay1"],
        timeout: 30000,
      })
    })
  })

  describe("event handling", () => {
    it("should emit progress events", () => {
      const request = makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
      })

      // Get the event handler
      const eventHandler = mockSubscription.on.mock.calls.find(
        call => call[0] === SubscriptionEvent.Event,
      )[1]

      // Simulate progress event
      const progressEvent = {
        kind: 7000,
        content: "progress",
      } as TrustedEvent

      eventHandler("relay1", progressEvent)

      expect(request.emitter.emit).toHaveBeenCalledWith(DVMEvent.Progress, "relay1", progressEvent)
    })

    it("should emit and auto-close on result events", () => {
      const request = makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
      })

      // Get the event handler
      const eventHandler = mockSubscription.on.mock.calls.find(
        call => call[0] === SubscriptionEvent.Event,
      )[1]

      // Simulate result event
      const resultEvent = {
        kind: 6000,
        content: "result",
      } as TrustedEvent

      eventHandler("relay1", resultEvent)

      expect(request.emitter.emit).toHaveBeenCalledWith(DVMEvent.Result, "relay1", resultEvent)
      expect(request.sub.close).toHaveBeenCalled()
    })

    it("should not auto-close when autoClose is false", () => {
      const request = makeDvmRequest({
        event: baseEvent,
        relays: ["relay1"],
        autoClose: false,
      })

      // Get the event handler
      const eventHandler = mockSubscription.on.mock.calls.find(
        call => call[0] === SubscriptionEvent.Event,
      )[1]

      // Simulate result event
      const resultEvent = {
        kind: 6000,
        content: "result",
      } as TrustedEvent

      eventHandler("relay1", resultEvent)

      expect(request.sub.close).not.toHaveBeenCalled()
    })
  })

  describe("request object structure", () => {
    it("should return correctly structured request object", () => {
      const requestOpts = {
        event: baseEvent,
        relays: ["relay1"],
        timeout: 5000,
        autoClose: false,
        reportProgress: false,
      }

      const request = makeDvmRequest(requestOpts)

      expect(request).toEqual({
        request: requestOpts,
        emitter: expect.any(Object),
        sub: mockSubscription,
        pub: mockPublish,
      })
    })
  })
})
