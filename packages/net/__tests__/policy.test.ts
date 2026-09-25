import {RELAY_JOIN} from "@welshman/util"
import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Socket, SocketStatus, SocketEvent} from "../src/socket"
import {AuthStatus, AuthStateEvent} from "../src/auth"
import {
  socketPolicyAuthBuffer,
  socketPolicyCancelUnsent,
  socketPolicyConnectOnSend,
  socketPolicyLifecycle,
} from "../src/policy"
import {ClientMessage, RelayMessage} from "../src/message"

// Hoist mock definition to top level
const mockWs = vi.hoisted(() => ({
  close: vi.fn(),
  send: vi.fn(),
  onopen: vi.fn(),
  onclose: null,
  onerror: null,
  onmessage: null,
}))

// Mock the WebSocket module
vi.mock("isomorphic-ws", () => ({
  default: mockWs,
}))

describe("policy", () => {
  let socket: Socket

  beforeEach(() => {
    vi.useFakeTimers()
    socket = new Socket("wss://test.relay")
  })

  afterEach(() => {
    socket.cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("socketPolicyAuthBuffer", () => {
    it("should buffer messages when not authenticated", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Regular event should be buffered
      const event: ClientMessage = ["EVENT", {id: "123"}]
      socket.send(event)
      expect(sendSpy).toHaveBeenCalledWith(event)

      // Auth event should not be buffered
      const authEvent: ClientMessage = ["AUTH", {id: "456"}]
      socket.send(authEvent)
      expect(sendSpy).toHaveBeenCalledWith(authEvent)

      // Auth join event should not be buffered
      const joinEvent: ClientMessage = ["EVENT", {id: "789", kind: RELAY_JOIN}]
      socket.send(joinEvent)
      expect(sendSpy).toHaveBeenCalledWith(joinEvent)

      cleanup()
    })

    it("should send buffered messages when auth succeeds", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Buffer some messages
      const event1: ClientMessage = ["EVENT", {id: "123"}]
      const event2: ClientMessage = ["EVENT", {id: "456"}]
      socket.send(event1)
      socket.send(event2)

      // Auth succeeds
      socket.send(["AUTH", {id: "auth"}])
      socket.emit(AuthStateEvent.Status, AuthStatus.Ok)

      expect(sendSpy).toHaveBeenCalledWith(event1)
      expect(sendSpy).toHaveBeenCalledWith(event2)

      cleanup()
    })

    it("should handle CLOSE messages properly", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Receive, ["AUTH", "challenge"])

      // Buffer a REQ message
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.send(req)

      // Send CLOSE for buffered REQ
      const close: ClientMessage = ["CLOSE", "123"]
      socket.send(close)

      // Both messages should be sent
      expect(sendSpy).toHaveBeenCalledWith(req)
      expect(sendSpy).toHaveBeenCalledWith(close)

      cleanup()
    })

    const note = (id: string) => ({id, kind: 1, content: "", tags: [], pubkey: "", sig: ""})

    it("should withhold an auth-required refusal of a buffered event", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["EVENT", note("123")])
      socket.receive(["OK", "123", false, "auth-required: need to auth first"])

      expect(socket._recvQueue.items).toEqual([])

      cleanup()
    })

    it("should withhold an auth-required refusal of a buffered req", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["REQ", "123", {kinds: [1059]}])
      socket.receive([
        "CLOSED",
        "123",
        "ERROR: auth-required: requested filter requires authentication",
      ])

      expect(socket._recvQueue.items).toEqual([])

      cleanup()
    })

    it("should not treat an unrelated reason as auth-required", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const closed: RelayMessage = ["CLOSED", "123", "error: too many concurrent REQs"]

      socket.send(["REQ", "123", {kinds: [1]}])
      socket.receive(closed)

      expect(socket._recvQueue.items).toEqual([closed])

      cleanup()
    })

    it("should pass through a refusal of a message it can't replay", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const closed: RelayMessage = ["CLOSED", "123", "auth-required: log in"]

      socket.auth.setStatus(AuthStatus.Forbidden)
      socket.send(["REQ", "123", {kinds: [1]}])
      socket.receive(closed)

      expect(socket._recvQueue.items).toEqual([closed])

      cleanup()
    })

    it("should not retry RELAY_JOIN events", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const ok: RelayMessage = ["OK", "123", false, "auth-required: need to auth first"]

      socket.send(["EVENT", {...note("123"), kind: RELAY_JOIN}])
      socket.receive(ok)

      expect(socket._recvQueue.items).toEqual([ok])

      cleanup()
    })

    it("should not replay a message the relay has answered", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["EVENT", note("123")])
      socket.receive(["OK", "123", true, ""])

      const sendSpy = vi.spyOn(socket, "send")

      socket.auth.setStatus(AuthStatus.Ok)

      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should replay a subscription sent again only once", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["REQ", "123", {kinds: [1]}])
      socket.send(["REQ", "123", {kinds: [1], since: 10}])

      const sendSpy = vi.spyOn(socket, "send")

      socket.auth.setStatus(AuthStatus.Ok)

      expect(sendSpy.mock.calls).toEqual([[["REQ", "123", {kinds: [1], since: 10}]]])

      cleanup()
    })

    it("should replay a neg-open without the session's later messages", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["NEG-OPEN", "neg-1", {kinds: [1]}, "aa"])
      socket.send(["NEG-MSG", "neg-1", "bb"])

      const sendSpy = vi.spyOn(socket, "send")

      socket.auth.setStatus(AuthStatus.Ok)

      expect(sendSpy.mock.calls).toEqual([[["NEG-OPEN", "neg-1", {kinds: [1]}, "aa"]]])

      cleanup()
    })

    it("should drop a live subscription from a full buffer without closing it", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["REQ", "live", {kinds: [1]}])

      for (let i = 0; i < 1000; i++) {
        socket.send(["EVENT", note(`event-${i}`)])
      }

      expect(socket._recvQueue.items).toEqual([])

      cleanup()
    })

    it("should hand over a withheld refusal when its message leaves a full buffer", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const closed: RelayMessage = ["CLOSED", "req-0", "auth-required: log in"]
      const negErr: RelayMessage = ["NEG-ERR", "neg-0", "auth-required: log in"]

      socket.send(["REQ", "req-0", {kinds: [1]}])
      socket.send(["NEG-OPEN", "neg-0", {kinds: [1]}, ""])
      socket.receive(closed)
      socket.receive(negErr)

      for (let i = 0; i < 999; i++) {
        socket.send(["REQ", `req-${i + 1}`, {kinds: [1]}])
      }

      expect(socket._recvQueue.items).toEqual([closed])

      socket.send(["REQ", "one-more", {kinds: [1]}])

      expect(socket._recvQueue.items).toEqual([closed, negErr])

      cleanup()
    })

    it("should hand over withheld answers when auth fails, and nothing else", () => {
      const cleanup = socketPolicyAuthBuffer(socket)
      const closed: RelayMessage = ["CLOSED", "refused", "auth-required: log in"]
      const ok: RelayMessage = ["OK", "123", false, "auth-required: log in"]
      const eose: RelayMessage = ["EOSE", "served"]

      socket.send(["REQ", "refused", {kinds: [1]}])
      socket.send(["REQ", "served", {kinds: [1]}])
      socket.send(["EVENT", note("123")])
      socket.receive(["AUTH", "challenge"])
      socket.receive(closed)
      socket.receive(ok)
      socket.receive(eose)

      expect(socket._recvQueue.items).toEqual([["AUTH", "challenge"]])

      socket.auth.setStatus(AuthStatus.DeniedSignature)

      expect(socket._recvQueue.items).toEqual([["AUTH", "challenge"], closed, eose, ok])

      cleanup()
    })

    it("should forget a req the client closed", () => {
      const cleanup = socketPolicyAuthBuffer(socket)

      socket.send(["REQ", "123", {kinds: [1]}])
      socket.receive(["CLOSED", "123", "auth-required: log in"])
      socket.send(["CLOSE", "123"])
      socket.auth.setStatus(AuthStatus.Forbidden)

      expect(socket._recvQueue.items).toEqual([])

      cleanup()
    })
  })

  describe("socketPolicyCancelUnsent", () => {
    it("should drop a queued req along with its close", () => {
      const cleanup = socketPolicyCancelUnsent(socket)

      socket.send(["REQ", "abc", {}])
      socket.send(["REQ", "xyz", {}])
      socket.send(["CLOSE", "abc"])

      expect(socket._sendQueue.items).toEqual([["REQ", "xyz", {}]])

      cleanup()
    })

    it("should pair neg-close with neg-open", () => {
      const cleanup = socketPolicyCancelUnsent(socket)

      socket.send(["NEG-OPEN", "abc", {}, ""])
      socket.send(["NEG-CLOSE", "abc"])

      expect(socket._sendQueue.items).toEqual([])

      cleanup()
    })

    it("should not cancel a subscription of a different type", () => {
      const cleanup = socketPolicyCancelUnsent(socket)

      socket.send(["NEG-OPEN", "abc", {}, ""])
      socket.send(["CLOSE", "abc"])

      expect(socket._sendQueue.items).toEqual([
        ["NEG-OPEN", "abc", {}, ""],
        ["CLOSE", "abc"],
      ])

      cleanup()
    })

    it("should keep a close for a req that has already been sent", () => {
      const cleanup = socketPolicyCancelUnsent(socket)

      socket.send(["REQ", "abc", {}])

      // Stand in for the queue having drained
      socket._sendQueue.clear()
      socket.send(["CLOSE", "abc"])

      expect(socket._sendQueue.items).toEqual([["CLOSE", "abc"]])

      cleanup()
    })
  })

  describe("socketPolicyConnectOnSend", () => {
    it("should open socket on send when closed", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket starts closed
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should open the socket
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if already open", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket is open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should not try to open the socket
      expect(openSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should not open socket if there was a recent error", () => {
      const cleanup = socketPolicyConnectOnSend(socket)
      const openSpy = vi.spyOn(socket, "open")

      // Socket has an error
      socket.emit(SocketEvent.Status, SocketStatus.Error)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Send a message
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Sending, event)

      // Should not try to open the socket due to recent error
      expect(openSpy).not.toHaveBeenCalled()

      // Advance time past the error timeout
      vi.advanceTimersByTime(31000)

      // Send another message
      socket.emit(SocketEvent.Sending, event)

      // Now it should try to open
      expect(openSpy).toHaveBeenCalled()

      cleanup()
    })
  })

  describe("socketPolicyLifecycle", () => {
    // Stand in for the websocket: each reconnect attempt either reaches the relay or fails
    const reconnectSucceeds = () =>
      vi
        .spyOn(socket, "attemptToOpen")
        .mockImplementation(() => socket.emit(SocketEvent.Status, SocketStatus.Open))

    const reconnectFails = () =>
      vi
        .spyOn(socket, "attemptToOpen")
        .mockImplementation(() => socket.emit(SocketEvent.Status, SocketStatus.Error))

    it("should close socket after 30 seconds of inactivity", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(35000)

      // Socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    }, 100000)

    it("should reset timer on send activity", () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time partially
      vi.advanceTimersByTime(20000)

      // Send a message
      socket.emit(SocketEvent.Send, ["EVENT", {id: "123"}])
      socket.emit(SocketEvent.Receive, ["OK", "123", true, ""])

      // Advance time partially again
      vi.advanceTimersByTime(20000)

      // Socket should not be closed yet
      expect(closeSpy).not.toHaveBeenCalled()

      // Advance remaining time
      vi.advanceTimersByTime(11000)

      // Now socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should reset timer on receive activity", () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as open
      socket.emit(SocketEvent.Status, SocketStatus.Open)

      // Advance time partially
      vi.advanceTimersByTime(20000)

      // Receive a message
      socket.emit(SocketEvent.Receive, ["EVENT", "123", {id: "123"}])

      // Advance time partially again
      vi.advanceTimersByTime(20000)

      // Socket should not be closed yet
      expect(closeSpy).not.toHaveBeenCalled()

      // Advance remaining time
      vi.advanceTimersByTime(11000)

      // Now socket should be closed
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should not close socket if not open", () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      // Set socket as closed
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance time past the timeout
      vi.advanceTimersByTime(31000)

      // Socket should not be closed
      expect(closeSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should reopen socket when closed with pending messages", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      reconnectSucceeds()
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay (the ~5s flap guard)
      await vi.advanceTimersByTimeAsync(10000)

      // Should resend the pending event
      expect(sendSpy).toHaveBeenCalledWith(event)

      cleanup()
    })

    it("should reopen socket when closed with pending requests, bounded at the outage", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      reconnectSucceeds()
      const sendSpy = vi.spyOn(socket, "send")

      // Send a request that will be pending
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.emit(SocketEvent.Send, req)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay (the ~5s flap guard)
      await vi.advanceTimersByTimeAsync(10000)

      // Should resend the pending request, asking only for what it missed
      expect(sendSpy).toHaveBeenCalledWith(["REQ", "123", {kinds: [1], since: expect.any(Number)}])

      cleanup()
    })

    it("should catch a live request up over an outage it only learns about on wake", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      reconnectSucceeds()
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Receive, ["EOSE", "123"])

      const disconnectedAt = Math.round(Date.now() / 1000)

      // A live subscription: limit 0 asks for nothing stored, only what arrives from here on
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      // The machine sleeps for an hour. The socket died at the start of it, but the close only
      // lands once the browser wakes up, which is the whole reason `since` can't be read off now.
      await vi.advanceTimersByTimeAsync(3_600_000)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)
      await vi.advanceTimersByTimeAsync(10000)

      // limit 0 is gone, so the relay will send stored events, and the window reaches back to
      // before the outage rather than starting at the moment we noticed it
      expect(sendSpy).toHaveBeenCalledWith(["REQ", "123", {kinds: [1], since: disconnectedAt}])

      cleanup()
    })

    it("should bound a request that names its own window at the outage", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      reconnectSucceeds()
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Receive, ["EOSE", "123"])

      const disconnectedAt = Math.round(Date.now() / 1000)

      // A page of history. Everything up to the outage already arrived, so the replay picks up
      // from there rather than asking for the window again from its own start.
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], since: 1000, until: 2000}])
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      await vi.advanceTimersByTimeAsync(10000)

      expect(sendSpy).toHaveBeenCalledWith([
        "REQ",
        "123",
        {kinds: [1], since: disconnectedAt, until: 2000},
      ])

      cleanup()
    })

    it("should not reopen socket immediately after previous open", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      reconnectSucceeds()
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Socket opens then closes quickly
      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance to just inside the flap guard
      vi.advanceTimersByTime(4900)

      // Should not resend yet to prevent flapping
      expect(sendSpy).not.toHaveBeenCalled()

      // Advance remaining time past the reopen delay
      await vi.advanceTimersByTimeAsync(2000)

      // Now should resend
      expect(sendSpy).toHaveBeenCalledWith(event)

      cleanup()
    })

    it("should back off while the relay is unreachable", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const openSpy = reconnectFails()
      const sendSpy = vi.spyOn(socket, "send")

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      // The relay goes away after being up for a while, and every attempt to reach it fails
      await vi.advanceTimersByTimeAsync(10000)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)
      await vi.advanceTimersByTimeAsync(60000)

      // Attempts after 0s, 1s, 3s, 7s, 15s and 31s, rather than one per failure
      expect(openSpy).toHaveBeenCalledTimes(6)

      // Nothing is replayed onto a socket that never opened
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should replay pending messages once when the relay comes back", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const sendSpy = vi.spyOn(socket, "send")
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, req)

      reconnectFails()
      await vi.advanceTimersByTimeAsync(10000)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)
      await vi.advanceTimersByTimeAsync(20000)

      reconnectSucceeds()
      await vi.advanceTimersByTimeAsync(60000)

      // Once the socket is back, it's probed as well, but the subscription goes out a single time
      const replays = sendSpy.mock.calls.filter(([message]) => message[1] === "123")

      expect(replays).toEqual([[["REQ", "123", {kinds: [1], since: expect.any(Number)}]]])

      cleanup()
    })

    it("should start backing off from scratch once the relay answers", async () => {
      const cleanup = socketPolicyLifecycle(socket)

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      // A long outage runs the delay up
      const failSpy = reconnectFails()
      await vi.advanceTimersByTimeAsync(10000)
      socket.emit(SocketEvent.Status, SocketStatus.Closed)
      await vi.advanceTimersByTimeAsync(120000)
      failSpy.mockRestore()

      // The relay comes back and talks to us, then drops again a while later
      reconnectSucceeds()
      await vi.advanceTimersByTimeAsync(300000)
      socket.emit(SocketEvent.Receive, ["EOSE", "123"])
      await vi.advanceTimersByTimeAsync(10000)

      const openSpy = reconnectSucceeds()
      socket.emit(SocketEvent.Status, SocketStatus.Closed)
      await vi.advanceTimersByTimeAsync(0)

      expect(openSpy).toHaveBeenCalledTimes(1)

      cleanup()
    })

    it("should remove pending messages when they complete", () => {
      const cleanup = socketPolicyLifecycle(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send an event that will be pending
      const event: ClientMessage = ["EVENT", {id: "123", kind: 1}]
      socket.emit(SocketEvent.Send, event)

      // Event completes successfully
      socket.emit(SocketEvent.Receive, ["OK", "123", true])

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      vi.advanceTimersByTime(30000)

      // Should not resend since event was completed
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should remove pending messages when closed", () => {
      const cleanup = socketPolicyLifecycle(socket)
      const sendSpy = vi.spyOn(socket, "send")

      // Send a request that will be pending
      const req: ClientMessage = ["REQ", "123", {kinds: [1]}]
      socket.emit(SocketEvent.Send, req)

      // Send close for the request
      const close: ClientMessage = ["CLOSE", "123"]
      socket.emit(SocketEvent.Send, close)

      // Socket closes
      socket.emit(SocketEvent.Status, SocketStatus.Closed)

      // Advance past the reopen delay
      vi.advanceTimersByTime(30000)

      // Should not resend since request was closed
      expect(sendSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should probe a quiet socket that still has work outstanding", async () => {
      const cleanup = socketPolicyLifecycle(socket)

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      const sendSpy = vi.spyOn(socket, "send")

      // A live subscription on a quiet room neither sends nor receives, which on its own looks
      // exactly like a socket whose relay has gone away
      await vi.advanceTimersByTimeAsync(35000)

      expect(sendSpy).toHaveBeenCalledWith(["REQ", expect.stringMatching(/^PING-/), {ids: []}])

      cleanup()
    })

    it("should close a socket whose probe goes unanswered", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      await vi.advanceTimersByTimeAsync(35000)

      expect(closeSpy).not.toHaveBeenCalled()

      // Nothing comes back, so the relay is gone however open the socket looks. Closing it is
      // what hands it to the reconnect, which is the only thing that can catch the subscription
      // back up.
      await vi.advanceTimersByTimeAsync(15000)

      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })

    it("should leave a socket alone once anything answers its probe", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const closeSpy = vi.spyOn(socket, "close")

      socket.emit(SocketEvent.Status, SocketStatus.Open)
      socket.emit(SocketEvent.Send, ["REQ", "123", {kinds: [1], limit: 0}])

      await vi.advanceTimersByTimeAsync(35000)

      socket.emit(SocketEvent.Receive, ["EOSE", "123"])

      await vi.advanceTimersByTimeAsync(15000)

      expect(closeSpy).not.toHaveBeenCalled()

      cleanup()
    })

    it("should reap an idle socket rather than probing one nothing is waiting on", async () => {
      const cleanup = socketPolicyLifecycle(socket)
      const sendSpy = vi.spyOn(socket, "send")
      const closeSpy = vi.spyOn(socket, "close")

      socket.emit(SocketEvent.Status, SocketStatus.Open)

      await vi.advanceTimersByTimeAsync(35000)

      expect(sendSpy).not.toHaveBeenCalled()
      expect(closeSpy).toHaveBeenCalled()

      cleanup()
    })
  })
})
