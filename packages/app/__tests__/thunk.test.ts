import {now} from "@welshman/lib"
import {publish, PublishStatus, MockAdapter} from "@welshman/net"
import {NOTE,  makeEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {LOCAL_RELAY_URL} from "@welshman/relay"
import {getPubkey, makeSecret} from "@welshman/signer"
import {EventEmitter} from "events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {repository, tracker} from "../src/core"
import {addSession, dropSession} from "../src/session"
import {
  abortThunk,
  makeThunk,
  mergeThunks,
  prepEvent,
  publishThunk,
  publishThunks,
  thunkQueue,
  walkThunks,
} from "../src/thunk"

const secret = makeSecret()

const pubkey = getPubkey(secret)

const mockRequest = {
  event: prepEvent({...makeEvent(NOTE), pubkey}),
  relays: [LOCAL_RELAY_URL],
}

describe("thunk", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addSession({method: 'nip01', secret, pubkey})
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

  describe("mergeThunks", () => {
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
      const publishSpy = vi.spyOn(repository, 'publish')
      const result = publishThunk(mockRequest)

      expect(publishSpy).toHaveBeenCalled()
      expect(result).toHaveProperty("event")
      expect(result).toHaveProperty("request")
    })

    it("should handle abort", () => {
      const removeEventSpy = vi.spyOn(repository, 'removeEvent')
      const thunk = publishThunk(mockRequest)

      thunk.controller.abort()

      expect(removeEventSpy).toHaveBeenCalledWith(thunk.event.id)
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

  it("should update status during publishing", async () => {
    const send = vi.fn()
    const track = vi.spyOn(tracker, 'track')
    const thunk = makeThunk(mockRequest)
    let status = {}

    // Subscribe to status updates
    thunk.status.subscribe(_status => {
      status = _status
    })

    // Start the publish process
    thunkQueue.push(thunk)

    // Wait for initial async operations
    await vi.runAllTimersAsync()

    expect(status[LOCAL_RELAY_URL]).toEqual({
      status: PublishStatus.Success,
      message: "",
    })

    // Verify tracker was called on success
    expect(track).toHaveBeenCalledWith(thunk.event.id, LOCAL_RELAY_URL)

    await vi.runAllTimersAsync()

    const finalStatus = await thunk.result
    expect(finalStatus).toEqual({
      [LOCAL_RELAY_URL]: {status: PublishStatus.Success, message: ""},
    })
  })
})
