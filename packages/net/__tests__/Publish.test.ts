import {ctx} from "@welshman/lib"
import type {SignedEvent} from "@welshman/util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {makePublish, publish, PublishStatus} from "../src/Publish"

// Mock dependencies
vi.mock("@welshman/lib", async importOriginal => {
  return {
    ...(await importOriginal()),
    randomId: () => "test-id",
    now: () => 1000,
    defer: () => ({
      resolve: vi.fn(),
      reject: vi.fn(),
      promise: Promise.resolve(),
    }),
  }
})

vi.mock("@welshman/util", () => ({
  asSignedEvent: vi.fn(event => event),
}))

describe("Publish", () => {
  let mockExecutor: any
  let mockExecutorSub: any

  beforeEach(() => {
    vi.useFakeTimers()

    mockExecutorSub = {
      unsubscribe: vi.fn(),
    }

    mockExecutor = {
      publish: vi.fn().mockReturnValue(mockExecutorSub),
      target: {
        cleanup: vi.fn(),
      },
    }

    ctx.net = {
      ...ctx.net,
      getExecutor: vi.fn().mockReturnValue(mockExecutor),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("makePublish", () => {
    it("should create publish object with correct properties", () => {
      const request = {
        event: {id: "event123"} as SignedEvent,
        relays: ["relay1"],
      }

      const pub = makePublish(request)

      expect(pub).toEqual({
        id: "test-id",
        created_at: 1000,
        request,
        emitter: expect.any(Object),
        result: expect.any(Object),
        status: expect.any(Map),
      })
    })
  })

  describe("publish", () => {
    const event = {id: "event123"} as SignedEvent
    const relays = ["relay1", "relay2"]

    it("should initialize publish with pending status", async () => {
      const pub = publish({event, relays})

      await vi.advanceTimersToNextTimerAsync()

      relays.forEach(relay => {
        expect(pub.status.get(relay)).toBe(PublishStatus.Pending)
      })
    })

    it("should delegate to executor with correct parameters", () => {
      publish({event, relays})

      expect(ctx.net.getExecutor).toHaveBeenCalledWith(relays)
      expect(mockExecutor.publish).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          verb: "EVENT",
          onOk: expect.any(Function),
          onError: expect.any(Function),
        }),
      )
    })

    it("should handle successful publish", async () => {
      const pub = publish({event, relays})
      await vi.runAllTimersAsync()

      const onOk = mockExecutor.publish.mock.calls[0][1].onOk
      onOk("relay1", event.id, true, "success")

      expect(pub.status.get("relay1")).toBe(PublishStatus.Success)
    })

    it("should handle failed publish", async () => {
      const pub = publish({event, relays})
      await vi.runAllTimersAsync()

      const onOk = mockExecutor.publish.mock.calls[0][1].onOk
      onOk("relay1", event.id, false, "failed")

      expect(pub.status.get("relay1")).toBe(PublishStatus.Failure)
    })

    it("should handle publish errors", async () => {
      const pub = publish({event, relays})
      await vi.runAllTimersAsync()

      const onError = mockExecutor.publish.mock.calls[0][1].onError
      onError("relay1")

      expect(pub.status.get("relay1")).toBe(PublishStatus.Failure)
    })

    it("should handle timeout", async () => {
      const pub = publish({event, relays, timeout: 5000})
      await vi.runAllTimersAsync()

      relays.forEach(relay => {
        expect(pub.status.get(relay)).toBe(PublishStatus.Timeout)
      })
    })

    it("should handle abort signal", async () => {
      const controller = new AbortController()
      const pub = publish({event, relays, signal: controller.signal})
      await vi.advanceTimersToNextTimerAsync()

      controller.abort()

      relays.forEach(relay => {
        expect(pub.status.get(relay)).toBe(PublishStatus.Aborted)
      })
    })

    it("should cleanup when all relays complete", async () => {
      const pub = publish({event, relays})
      await vi.runAllTimersAsync()

      const onOk = mockExecutor.publish.mock.calls[0][1].onOk

      // Complete all relays
      relays.forEach(relay => {
        onOk(relay, event.id, true, "success")
      })

      expect(mockExecutorSub.unsubscribe).toHaveBeenCalled()
      expect(mockExecutor.target.cleanup).toHaveBeenCalled()
      expect(pub.result.resolve).toHaveBeenCalledWith(pub.status)
    })

    it("should use custom verb if provided", () => {
      const pub = publish({event, relays, verb: "AUTH"})

      expect(mockExecutor.publish.mock.calls[0][1].verb).toBe("AUTH")
    })

    it("should use default timeout if not specified", async () => {
      const pub = publish({event, relays})

      // Advance to default timeout
      await vi.advanceTimersByTimeAsync(10_000)

      relays.forEach(relay => {
        expect(pub.status.get(relay)).toBe(PublishStatus.Timeout)
      })
    })
  })
})
