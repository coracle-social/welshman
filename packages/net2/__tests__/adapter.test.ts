import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Socket, SocketEventType } from "../src/socket"
import { Relay, LOCAL_RELAY_URL, isRelayUrl } from "@welshman/util"
import { AdapterEventType, SocketAdapter, LocalAdapter, getAdapter } from "../src/adapter"
import { Pool } from "../src/pool"
import { ClientMessage, RelayMessage } from "../src/message"
import EventEmitter from "events"

vi.mock("@welshman/lib", () => ({
  on: (target: any, eventName: string, callback: Function) => {
    target.on(eventName, callback)
    return () => target.off(eventName, callback)
  },
  call: (fn: Function) => fn()
}))

vi.mock("../src/socket")
vi.mock("@welshman/util", () => ({
  Relay: vi.fn(() => new EventEmitter()),
  LOCAL_RELAY_URL: "local://welshman.relay/",
  isRelayUrl: vi.fn((url) => url.startsWith("wss://"))
}))

describe("SocketAdapter", () => {
  let socket: Socket
  let adapter: SocketAdapter

  beforeEach(() => {
    const mockSocket = new EventEmitter()
    Object.assign(mockSocket, {
      url: "wss://test.relay",
      send: vi.fn(),
      removeAllListeners: vi.fn()
    })
    socket = mockSocket as unknown as Socket
    adapter = new SocketAdapter(socket)
  })

  afterEach(() => {
    adapter.cleanup()
    vi.clearAllMocks()
  })

  it("should initialize with correct socket", () => {
    expect(adapter.socket).toBe(socket)
    expect(adapter.urls).toEqual(["wss://test.relay"])
    expect(adapter.sockets).toEqual([socket])
  })

  it("should forward received messages", () => {
    const receiveSpy = vi.fn()
    adapter.on(AdapterEventType.Receive, receiveSpy)

    const message: RelayMessage = ["EVENT", "123", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
    socket.emit(SocketEventType.Receive, message, "wss://test.relay")

    expect(receiveSpy).toHaveBeenCalledWith(message, "wss://test.relay")
  })

  it("should send messages to socket", () => {
    const message: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
    adapter.send(message)

    expect(socket.send).toHaveBeenCalledWith(message)
  })

  it("should cleanup properly", () => {
    const removeListenersSpy = vi.spyOn(adapter, "removeAllListeners")
    adapter.cleanup()
    expect(removeListenersSpy).toHaveBeenCalled()
  })
})

describe("LocalAdapter", () => {
  let relay: Relay & EventEmitter
  let adapter: LocalAdapter

  beforeEach(() => {
    const mockRelay = new EventEmitter()
    Object.assign(mockRelay, {
      send: vi.fn(),
      removeAllListeners: vi.fn()
    })
    relay = mockRelay as unknown as Relay & EventEmitter
    adapter = new LocalAdapter(relay)
  })

  afterEach(() => {
    adapter.cleanup()
    vi.clearAllMocks()
  })

  it("should initialize with correct relay", () => {
    expect(adapter.relay).toBe(relay)
    expect(adapter.urls).toEqual([LOCAL_RELAY_URL])
    expect(adapter.sockets).toEqual([])
  })

  it("should forward received messages", () => {
    const receiveSpy = vi.fn()
    adapter.on(AdapterEventType.Receive, receiveSpy)

    const message: RelayMessage = ["EVENT", "123", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
    relay.emit("*", ...message)

    expect(receiveSpy).toHaveBeenCalledWith(message, LOCAL_RELAY_URL)
  })

  it("should send messages to relay", () => {
    const message: ClientMessage = ["EVENT", { id: "123", kind: 1, content: "", tags: [], pubkey: "", sig: "" }]
    adapter.send(message)

    expect(relay.send).toHaveBeenCalledWith("EVENT", message[1])
  })

  it("should cleanup properly", () => {
    const removeListenersSpy = vi.spyOn(adapter, "removeAllListeners")
    adapter.cleanup()
    expect(removeListenersSpy).toHaveBeenCalled()
  })
})

describe("getAdapter", () => {
  let pool: Pool
  let relay: Relay

  beforeEach(() => {
    pool = new Pool()
    relay = new Relay()
    pool.get = vi.fn().mockReturnValue(new Socket("wss://test.relay"))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("should return LocalAdapter for local relay URL", () => {
    const url = LOCAL_RELAY_URL
    const adapter = getAdapter(url, { relay })
    expect(adapter).toBeInstanceOf(LocalAdapter)
  })

  it("should return SocketAdapter for remote relay URL", () => {
    const url = "wss://test.relay"
    const adapter = getAdapter(url, { pool })
    expect(adapter).toBeInstanceOf(SocketAdapter)
  })

  it("should throw error for invalid relay URL", () => {
    vi.mocked(isRelayUrl).mockReturnValue(false)
    expect(() => getAdapter("invalid-url", {})).toThrow("Invalid relay url invalid-url")
  })

  it("should throw error for local relay URL without relay context", () => {
    const url = LOCAL_RELAY_URL
    expect(() => getAdapter(url, {})).toThrow(`Unable to get local relay for ${url}`)
  })

  it("should throw error for remote relay URL without pool context", () => {
    const url = "wss://test.relay"
    vi.mocked(isRelayUrl).mockReturnValue(true)
    expect(() => getAdapter(url, {})).toThrow(`Unable to get socket for ${url}`)
  })

  it("should use custom adapter if provided", () => {
    const customAdapter = new SocketAdapter(new Socket("wss://test.relay"))
    const getCustomAdapter = vi.fn().mockReturnValue(customAdapter)
    const url = "wss://test.relay"

    const adapter = getAdapter(url, { getAdapter: getCustomAdapter })

    expect(getCustomAdapter).toHaveBeenCalledWith(url, { getAdapter: getCustomAdapter })
    expect(adapter).toBe(customAdapter)
  })
})
