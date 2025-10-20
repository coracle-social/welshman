import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {makeEvent} from "@welshman/util"
import {prep, getPubkey, makeSecret} from "@welshman/signer"
import {AdapterEvent, SocketAdapter, LocalAdapter, getAdapter} from "../src/adapter"
import {Repository, LOCAL_RELAY_URL} from "../src/repository"
import {ClientMessage, RelayMessage} from "../src/message"
import {Socket, SocketEvent} from "../src/socket"
import {Pool} from "../src/pool"

vi.mock("isomorphic-ws", () => {
  const WebSocket = vi.fn(function (this: any) {
    setTimeout(() => this.onopen())
  })

  WebSocket.prototype.send = vi.fn()

  WebSocket.prototype.close = vi.fn(function (this: any) {
    this.onclose()
  })

  return {default: WebSocket}
})

describe("SocketAdapter", () => {
  let socket: Socket
  let adapter: SocketAdapter

  beforeEach(() => {
    vi.useFakeTimers()
    socket = new Socket("wss://test.relay")
    adapter = new SocketAdapter(socket)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    socket.cleanup()
    adapter.cleanup()
  })

  it("should initialize with correct socket", () => {
    expect(adapter.socket).toBe(socket)
    expect(adapter.urls).toEqual(["wss://test.relay"])
    expect(adapter.sockets).toEqual([socket])
  })

  it("should forward received messages", () => {
    const receiveSpy = vi.fn()
    adapter.on(AdapterEvent.Receive, receiveSpy)

    const message: RelayMessage = ["EVENT", "123", {id: "123", kind: 1}]
    socket.emit(SocketEvent.Receive, message, "wss://test.relay")

    expect(receiveSpy).toHaveBeenCalledWith(message, "wss://test.relay")
  })

  it("should send messages to socket", () => {
    const sendSpy = vi.spyOn(socket, "send")
    const message: ClientMessage = ["EVENT", {id: "123", kind: 1}]
    adapter.send(message)

    expect(sendSpy).toHaveBeenCalledWith(message)
  })

  it("should cleanup properly", () => {
    const removeListenersSpy = vi.spyOn(adapter, "removeAllListeners")
    adapter.cleanup()
    expect(removeListenersSpy).toHaveBeenCalled()
  })
})

describe("LocalAdapter", () => {
  let repository: Repository
  let adapter: LocalAdapter

  beforeEach(() => {
    repository = new Repository()
    adapter = new LocalAdapter(repository)
    vi.useFakeTimers()
  })

  afterEach(() => {
    adapter.cleanup()
    vi.clearAllMocks()
  })

  it("should initialize with correct relay", () => {
    expect(adapter.urls).toEqual([LOCAL_RELAY_URL])
    expect(adapter.sockets).toEqual([])
  })

  it("should forward received messages", () => {
    const receiveSpy = vi.fn()
    const pubkey = getPubkey(makeSecret())
    const event = prep(makeEvent(1), pubkey)

    adapter.send(["REQ", "r1", {kinds: [1]}])
    adapter.send(["REQ", "r2", {kinds: [2]}])
    adapter.on(AdapterEvent.Receive, receiveSpy)
    repository.publish(event)

    expect(receiveSpy).toHaveBeenCalledTimes(1)
    expect(receiveSpy).toHaveBeenCalledWith(["EVENT", "r1", event], LOCAL_RELAY_URL)
  })

  it("should send messages to relay", async () => {
    const publishSpy = vi.spyOn(repository, "publish")
    const pubkey = getPubkey(makeSecret())
    const event = prep(makeEvent(1), pubkey)

    adapter.send(["EVENT", event])

    await vi.runAllTimersAsync()

    expect(publishSpy).toHaveBeenCalledTimes(1)
    expect(publishSpy).toHaveBeenCalledWith(event)
  })
})

describe("getAdapter", () => {
  let pool: Pool
  let repository: Repository

  beforeEach(() => {
    pool = new Pool({
      makeSocket: () => new Socket("wss://test.relay"),
    })

    repository = new Repository()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should return LocalAdapter for local relay URL", () => {
    const url = LOCAL_RELAY_URL
    const adapter = getAdapter(url, {repository})
    expect(adapter).toBeInstanceOf(LocalAdapter)
  })

  it("should return SocketAdapter for remote relay URL", () => {
    const url = "wss://test.relay"
    const adapter = getAdapter(url, {pool})
    expect(adapter).toBeInstanceOf(SocketAdapter)
  })

  it("should use custom adapter if provided", () => {
    const customAdapter = new SocketAdapter(new Socket("wss://test.relay"))
    const getCustomAdapter = vi.fn().mockReturnValue(customAdapter)
    const url = "wss://test.relay"

    const adapter = getAdapter(url, {getAdapter: getCustomAdapter})

    expect(getCustomAdapter).toHaveBeenCalledWith(
      url,
      expect.objectContaining({getAdapter: getCustomAdapter}),
    )
    expect(adapter).toBe(customAdapter)
  })
})
