import {now} from "@welshman/lib"
import {publish, PublishStatus} from "@welshman/net"
import {NOTE} from "@welshman/util"
import {EventEmitter} from "events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {repository, tracker} from "../src/core"
import * as sessionModule from "../src/session"
import {
  abortThunk,
  makeThunk,
  mergeThunks,
  prepEvent,
  publishThunk,
  publishThunks,
  thunkWorker,
  walkThunks,
} from "../src/thunk"

// Mock dependencies
vi.mock("@welshman/net", () => ({
  publish: vi.fn().mockReturnValue({emitter: {on: vi.fn()}}),
  PublishStatus: {
    Pending: "pending",
    Success: "success",
    Failure: "failure",
    Timeout: "timeout",
    Aborted: "aborted",
  },
}))

vi.mock("../src/session", () => ({
  pubkey: {
    get: vi.fn().mockReturnValue("aa".repeat(32)),
  },
  getSession: vi.fn(),
  getSigner: vi.fn(),
}))

vi.mock("../src/core", () => ({
  repository: {
    publish: vi.fn(),
    removeEvent: vi.fn(),
    getEvent: vi.fn(),
  },
  tracker: {
    track: vi.fn(),
  },
}))

const pubkey = "aa".repeat(32)
const id = "00".repeat(32)
const mockEvent = {
  id,
  pubkey,
  kind: NOTE,
  created_at: now(),
  content: "test content",
  tags: [],
}

const mockRequest = {
  event: mockEvent,
  relays: ["relay1", "relay2"],
}

describe("thunk", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    thunkWorker.clear()
    thunkWorker.pause() // clear timeout
    thunkWorker.resume()
  })

  describe("prepEvent", () => {
    it("should prepare an event with stamp, own, and hash", () => {
      const result = prepEvent(mockEvent)
      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("pubkey")
      expect(result).toHaveProperty("created_at")
    })
  })

  describe("makeThunk", () => {
    it("should create a thunk with required properties", () => {
      const thunk = makeThunk(mockRequest)
      expect(thunk).toHaveProperty("event")
      expect(thunk).toHaveProperty("request")
      expect(thunk).toHaveProperty("controller")
      expect(thunk).toHaveProperty("result")
      expect(thunk).toHaveProperty("status")
    })
  })

  describe("mergeThunks", () => {
    it("should merge multiple thunks", () => {
      const thunk1 = makeThunk(mockRequest)
      const thunk2 = makeThunk(mockRequest)
      const merged = mergeThunks([thunk1, thunk2])

      expect(merged).toHaveProperty("thunks")
      expect(merged.thunks).toHaveLength(2)
      expect(merged).toHaveProperty("controller")
      expect(merged).toHaveProperty("result")
      expect(merged).toHaveProperty("status")
    })

    it("should abort all thunks when merged controller aborts", () => {
      const thunk1 = makeThunk(mockRequest)
      const thunk2 = makeThunk(mockRequest)
      const merged = mergeThunks([thunk1, thunk2])

      merged.controller.abort()

      expect(thunk1.controller.signal.aborted).toBe(true)
      expect(thunk2.controller.signal.aborted).toBe(true)
    })
  })

  describe("walkThunks", () => {
    it("should iterate through nested thunks", () => {
      const thunk1 = makeThunk(mockRequest)
      const thunk2 = makeThunk(mockRequest)
      const merged = mergeThunks([thunk1, thunk2])
      const thunks = Array.from(walkThunks([merged, thunk1]))

      expect(thunks).toHaveLength(3)
    })
  })

  describe("publishThunk", () => {
    it("should create and publish a thunk", async () => {
      const result = publishThunk(mockRequest)

      expect(repository.publish).toHaveBeenCalled()
      expect(result).toHaveProperty("event")
      expect(result).toHaveProperty("request")
    })

    it("should handle abort", () => {
      const thunk = publishThunk(mockRequest)
      thunk.controller.abort()

      expect(repository.removeEvent).toHaveBeenCalledWith(thunk.event.id)
    })
  })

  describe("publishThunks", () => {
    it("should publish multiple thunks", () => {
      const requests = [mockRequest, mockRequest]
      const result = publishThunks(requests)

      expect(repository.publish).toHaveBeenCalledTimes(2)
      expect(result.thunks).toHaveLength(2)
    })
  })

  describe("abortThunk", () => {
    it("should abort a thunk and clean up", () => {
      const thunk = makeThunk(mockRequest)
      abortThunk(thunk)

      expect(repository.removeEvent).toHaveBeenCalledWith(thunk.event.id)
    })
  })
})

describe("thunkWorker", async () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    thunkWorker.clear()
  })

  const mockSigner = {
    sign: vi.fn().mockResolvedValue({...mockEvent, sig: "test-sig"}),
  }
  vi.mocked(sessionModule.getSigner).mockReturnValue(mockSigner)

  it("should handle publishing events", async () => {
    const thunk = makeThunk(mockRequest)

    thunkWorker.push(thunk)

    await vi.runAllTimersAsync()

    expect(mockSigner.sign).toHaveBeenCalled()
  })

  it("should handle delayed publishing", async () => {
    const thunk = makeThunk({...mockRequest, delay: 100})
    const startTime = Date.now()

    thunkWorker.push(thunk)

    await vi.runAllTimersAsync()

    const endTime = Date.now()
    // worker delays work by 50ms, so total delay should be 150ms
    expect(endTime - startTime).toBe(150)
  })

  it("should update status during publishing", async () => {
    // Create mock emitter
    const mockEmitter = new EventEmitter()
    vi.mocked(publish).mockReturnValue({
      emitter: mockEmitter,
    })

    const thunk = makeThunk(mockRequest)
    const statuses: Map<string, any> = new Map<string, any>()

    // Subscribe to status updates
    thunk.status.subscribe(status => {
      for (const [key, value] of Object.entries(status)) {
        statuses.set(key, value)
      }
    })

    // Start the publish process
    thunkWorker.push(thunk)

    // Wait for initial async operations
    await vi.runAllTimersAsync()

    // Simulate publish status updates
    mockEmitter.emit("*", PublishStatus.Pending, "relay1", "Connecting...")

    await vi.runAllTimersAsync()

    expect(statuses.get("relay1")).toEqual({
      status: PublishStatus.Pending,
      message: "Connecting...",
    })

    mockEmitter.emit("*", PublishStatus.Success, "relay1", "Published")

    await vi.runAllTimersAsync()

    expect(statuses.get("relay1")).toEqual({
      status: PublishStatus.Success,
      message: "Published",
    })

    // Verify tracker was called on success
    expect(tracker.track).toHaveBeenCalledWith(thunk.event.id, "relay1")

    // Verify all relays complete resolves the result
    mockEmitter.emit("*", PublishStatus.Success, "relay2", "Published")

    await vi.runAllTimersAsync()

    const finalStatus = await thunk.result
    expect(finalStatus).toEqual({
      relay1: {status: PublishStatus.Success, message: "Published"},
      relay2: {status: PublishStatus.Success, message: "Published"},
    })
  })

  it("should handle publish failures", async () => {
    const mockSigner = {
      sign: vi.fn().mockRejectedValue("Signing failed"),
    }

    vi.mocked(sessionModule.getSigner).mockReturnValue(mockSigner)

    const thunk = makeThunk(mockRequest)

    thunkWorker.push(thunk)

    await vi.runAllTimersAsync()

    expect(mockSigner.sign).toHaveBeenCalled()

    // in case of failure, the worker will just stop its task, event is not removed
  })
})
