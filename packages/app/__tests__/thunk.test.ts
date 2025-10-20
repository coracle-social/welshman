import {PublishStatus, LOCAL_RELAY_URL} from "@welshman/net"
import {NOTE, DIRECT_MESSAGE, WRAP, makeEvent} from "@welshman/util"
import {getPubkey, makeSecret, prep} from "@welshman/signer"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {repository, tracker} from "../src/core"
import {addSession, dropSession, makeNip01Session} from "../src/session"
import {abortThunk, MergedThunk, publishThunk, thunkQueue, flattenThunks} from "../src/thunk"

const secret = makeSecret()

const pubkey = getPubkey(secret)

const mockRequest = {
  event: prep({...makeEvent(NOTE), pubkey}),
  relays: [LOCAL_RELAY_URL],
}

describe("thunk", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addSession(makeNip01Session(secret))
  })

  afterEach(async () => {
    thunkQueue.stop()
    thunkQueue.clear()
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    vi.clearAllMocks()
    thunkQueue.start()
    dropSession(pubkey)
  })

  describe("MergedThunk", () => {
    it("should abort all thunks when merged controller aborts", () => {
      const thunk1 = publishThunk(mockRequest)
      const thunk2 = publishThunk(mockRequest)
      const merged = new MergedThunk([thunk1, thunk2])

      abortThunk(merged)

      expect(thunk1.controller.signal.aborted).toBe(true)
      expect(thunk2.controller.signal.aborted).toBe(true)
    })
  })

  describe("flattenThunks", () => {
    it("should iterate through nested thunks", () => {
      const thunk1 = publishThunk(mockRequest)
      const thunk2 = publishThunk(mockRequest)
      const merged = new MergedThunk([thunk1, thunk2])
      const thunks = Array.from(flattenThunks([merged, thunk1]))

      expect(thunks).toHaveLength(3)
    })
  })

  describe("publishThunk", () => {
    it("should create and publish a thunk", async () => {
      const publishSpy = vi.spyOn(repository, "publish")
      const result = publishThunk(mockRequest)

      expect(publishSpy).toHaveBeenCalled()
      expect(result).toHaveProperty("event")
      expect(result).toHaveProperty("options")
    })

    it("should handle abort", () => {
      const removeEventSpy = vi.spyOn(repository, "removeEvent")
      const thunk = publishThunk(mockRequest)

      abortThunk(thunk)

      expect(removeEventSpy).toHaveBeenCalledWith(thunk.event.id)
    })
  })

  describe("abortThunk", () => {
    it("should abort a thunk and clean up", () => {
      const removeEventSpy = vi.spyOn(repository, "removeEvent")
      const thunk = publishThunk(mockRequest)

      abortThunk(thunk)

      expect(removeEventSpy).toHaveBeenCalledWith(thunk.event.id)
    })
  })

  it("should update status during publishing", async () => {
    const track = vi.spyOn(tracker, "track")
    const thunk = publishThunk(mockRequest)

    // Wait for initial async operations
    await vi.runAllTimersAsync()

    expect(thunk.results[LOCAL_RELAY_URL].status).toEqual(PublishStatus.Success)

    // Verify tracker was called on success
    expect(track).toHaveBeenCalledWith(thunk.event.id, LOCAL_RELAY_URL)

    await vi.runAllTimersAsync()
    await thunk.complete

    expect(thunk.results[LOCAL_RELAY_URL].status).toEqual(PublishStatus.Success)
  })

  describe("wrapped events", () => {
    it("if recipient is included, the event should be wrapped", async () => {
      const recipient = getPubkey(makeSecret())
      const event = prep({...makeEvent(DIRECT_MESSAGE), pubkey})
      const thunk = publishThunk({event, relays: [], recipient})
      const publishSpy = vi.spyOn(thunk, "_publish")

      await vi.runAllTimersAsync()

      expect(publishSpy.mock.calls[0][0].kind).toBe(WRAP)
      expect(publishSpy.mock.calls[0][0].id).not.toBe(thunk.event.id)
    })
  })
})
