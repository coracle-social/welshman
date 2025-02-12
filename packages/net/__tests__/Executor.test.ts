import {ctx} from "@welshman/lib"
import type {Filter, SignedEvent, TrustedEvent} from "@welshman/util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {Executor} from "../src/Executor"
import {Negentropy} from "../src/Negentropy"

// Mock Negentropy
vi.mock("../src/Negentropy.js", () => ({
  Negentropy: vi.fn().mockImplementation(() => ({
    reconcile: vi.fn().mockResolvedValue(["newMsg", ["id1"], ["id2"]]),
    initiate: vi.fn().mockResolvedValue("initialMsg"),
  })),
  NegentropyStorageVector: vi.fn().mockImplementation(() => ({
    insert: vi.fn(),
    seal: vi.fn(),
  })),
}))

describe("Executor", () => {
  let mockTarget: any
  // let mockNegentropy: any
  let executor: Executor

  beforeEach(() => {
    vi.useFakeTimers()
    // Setup mock target
    mockTarget = {
      connections: [],
      send: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      cleanup: vi.fn(),
    }

    // Setup mock context
    ctx.net = {
      ...ctx.net,
      onEvent: vi.fn(),
    }

    executor = new Executor(mockTarget)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("subscribe", () => {
    const filters: Filter[] = [{kinds: [1]}]

    it("should setup subscription correctly", () => {
      const onEvent = vi.fn()
      const onEose = vi.fn()

      executor.subscribe(filters, {onEvent, onEose})

      expect(mockTarget.on).toHaveBeenCalledWith("EVENT", expect.any(Function))
      expect(mockTarget.on).toHaveBeenCalledWith("EOSE", expect.any(Function))
      expect(mockTarget.send).toHaveBeenCalledWith("REQ", expect.any(String), ...filters)
    })

    it("should handle events for matching subscription ID", () => {
      const onEvent = vi.fn()
      executor.subscribe(filters, {onEvent})

      // Get the event listener that was registered
      const eventListener = mockTarget.on.mock.calls.find(call => call[0] === "EVENT")[1]
      const event = {id: "123"} as TrustedEvent

      // Simulate event with matching subId (extract it from the REQ call)
      const subId = mockTarget.send.mock.calls[0][1]
      eventListener("relay1", subId, event)

      expect(ctx.net.onEvent).toHaveBeenCalledWith("relay1", event)
      expect(onEvent).toHaveBeenCalledWith("relay1", event)
    })

    it("should handle EOSE for matching subscription ID", () => {
      const onEose = vi.fn()
      executor.subscribe(filters, {onEose})

      const eoseListener = mockTarget.on.mock.calls.find(call => call[0] === "EOSE")[1]
      const subId = mockTarget.send.mock.calls[0][1]

      eoseListener("relay1", subId)

      expect(onEose).toHaveBeenCalledWith("relay1")
    })

    it("should cleanup on unsubscribe", () => {
      const sub = executor.subscribe(filters)
      const subId = mockTarget.send.mock.calls[0][1]

      sub.unsubscribe()

      expect(mockTarget.send).toHaveBeenLastCalledWith("CLOSE", subId)
      expect(mockTarget.off).toHaveBeenCalledTimes(2) // EVENT and EOSE listeners
    })

    it("should not send CLOSE multiple times", () => {
      const sub = executor.subscribe(filters)
      sub.unsubscribe()
      const sendCallCount = mockTarget.send.mock.calls.length

      sub.unsubscribe()

      expect(mockTarget.send.mock.calls.length).toBe(sendCallCount)
    })
  })

  describe("publish", () => {
    const event: SignedEvent = {
      id: "event123",
      kind: 1,
      content: "",
      tags: [],
      created_at: 0,
      pubkey: "",
      sig: "",
    }

    it("should setup publish correctly", () => {
      const onOk = vi.fn()
      const onError = vi.fn()

      executor.publish(event, {onOk, onError})

      expect(mockTarget.on).toHaveBeenCalledWith("OK", expect.any(Function))
      expect(mockTarget.on).toHaveBeenCalledWith("ERROR", expect.any(Function))
      expect(mockTarget.send).toHaveBeenCalledWith("EVENT", event)
    })

    it("should handle successful publish", () => {
      const onOk = vi.fn()
      executor.publish(event, {onOk})

      const okListener = mockTarget.on.mock.calls.find(call => call[0] === "OK")[1]
      okListener("relay1", event.id, true, "success")

      expect(ctx.net.onEvent).toHaveBeenCalledWith("relay1", event)
      expect(onOk).toHaveBeenCalledWith("relay1", event.id, true, "success")
    })

    it("should handle failed publish", () => {
      const onOk = vi.fn()
      executor.publish(event, {onOk})

      const okListener = mockTarget.on.mock.calls.find(call => call[0] === "OK")[1]
      okListener("relay1", event.id, false, "failed")

      expect(ctx.net.onEvent).not.toHaveBeenCalled()
      expect(onOk).toHaveBeenCalledWith("relay1", event.id, false, "failed")
    })

    it("should handle publish errors", () => {
      const onError = vi.fn()
      executor.publish(event, {onError})

      const errorListener = mockTarget.on.mock.calls.find(call => call[0] === "ERROR")[1]
      errorListener("relay1", event.id, "error message")

      expect(onError).toHaveBeenCalledWith("relay1", event.id, "error message")
    })

    it("should cleanup on unsubscribe", () => {
      const pub = executor.publish(event)
      pub.unsubscribe()

      expect(mockTarget.off).toHaveBeenCalledTimes(2) // OK and ERROR listeners
    })
  })

  describe("diff", () => {
    const filter: Filter = {kinds: [1]}
    const events: TrustedEvent[] = [
      {id: "event1", created_at: 1000} as TrustedEvent,
      {id: "event2", created_at: 2000} as TrustedEvent,
    ]

    it("should setup diff correctly", async () => {
      const onMessage = vi.fn()
      const onError = vi.fn()
      const onClose = vi.fn()

      executor.diff(filter, events, {onMessage, onError, onClose})

      expect(mockTarget.on).toHaveBeenCalledWith("NEG-MSG", expect.any(Function))
      expect(mockTarget.on).toHaveBeenCalledWith("NEG-ERR", expect.any(Function))
      // Wait for initiate promise
      await vi.runAllTimersAsync()
      expect(mockTarget.send).toHaveBeenCalledWith(
        "NEG-OPEN",
        expect.any(String),
        filter,
        "initialMsg",
      )
    })

    it("should handle diff messages", async () => {
      const onMessage = vi.fn()
      executor.diff(filter, events, {onMessage})

      const msgListener = mockTarget.on.mock.calls.find(call => call[0] === "NEG-MSG")[1]
      // wait for initiate promise
      await vi.advanceTimersToNextTimerAsync()

      await msgListener("relay1", mockTarget.send.mock.calls[0][1], "msg")

      expect(onMessage).toHaveBeenCalledWith("relay1", {
        have: ["id1"],
        need: ["id2"],
      })
    })

    it("should handle diff errors", async () => {
      const onError = vi.fn()
      executor.diff(filter, events, {onError})

      const errListener = mockTarget.on.mock.calls.find(call => call[0] === "NEG-ERR")[1]
      // wait for initiate promise
      await vi.advanceTimersToNextTimerAsync()

      errListener("relay1", mockTarget.send.mock.calls[0][1], "error")

      expect(onError).toHaveBeenCalledWith("relay1", "error")
    })

    it("should close diff when reconciliation completes", async () => {
      const onClose = vi.fn()
      executor.diff(filter, events, {onClose})

      const msgListener = mockTarget.on.mock.calls.find(call => call[0] === "NEG-MSG")[1]
      // wait for initiate promise
      await vi.advanceTimersToNextTimerAsync()

      // Get the mock instance's reconcile function from the last Negentropy constructor call
      const mockReconcile = vi.mocked(Negentropy).mock.results[0].value.reconcile
      mockReconcile.mockResolvedValueOnce([null, [], []])
      const reqId = mockTarget.send.mock.calls[0][1]

      await msgListener("relay1", reqId, "msg")

      expect(mockTarget.send).toHaveBeenCalledWith("NEG-CLOSE", reqId)
      expect(onClose).toHaveBeenCalled()
    })

    it("should cleanup on unsubscribe", () => {
      const diff = executor.diff(filter, events)
      diff.unsubscribe()

      expect(mockTarget.send).toHaveBeenCalledWith("NEG-CLOSE", expect.any(String))
      expect(mockTarget.off).toHaveBeenCalledTimes(2) // NEG-MSG and NEG-ERR listeners
    })
  })
})
