import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {ClientMessageType} from "../src/message"
import {MockAdapter, SocketAdapter} from "../src/adapter"
import {Socket} from "../src/socket"
import {countOne, count, supportsCount, COUNT_TIMEOUT} from "../src/count"

describe("countOne", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves with the relay's count", async () => {
    let id
    const sendSpy = vi.fn(m => {
      id = m[1]
    })
    const adapter = new MockAdapter("counts", sendSpy)

    const promise = countOne({
      relay: "counts",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Count, id, {kinds: [1]}])

    adapter.receive(["COUNT", id, {count: 42}])

    expect(await promise).toEqual(42)
    expect(supportsCount("counts")).toBe(true)
  })

  it("resolves undefined when the relay refuses, and stops asking it", async () => {
    let id
    const sendSpy = vi.fn(m => {
      id = m[1]
    })
    const adapter = new MockAdapter("refuses", sendSpy)
    const context = {getAdapter: () => adapter}

    const promise = countOne({relay: "refuses", filters: [{kinds: [1]}], context})

    adapter.receive(["CLOSED", id, "unsupported: no NIP-45 here"])

    expect(await promise).toBeUndefined()
    expect(supportsCount("refuses")).toBe(false)

    sendSpy.mockClear()

    expect(await countOne({relay: "refuses", filters: [{kinds: [1]}], context})).toBeUndefined()
    expect(sendSpy).not.toHaveBeenCalled()
  })

  it("resolves undefined when the relay says nothing", async () => {
    const adapter = new MockAdapter("silent", vi.fn())

    const promise = countOne({
      relay: "silent",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    vi.advanceTimersByTime(COUNT_TIMEOUT)

    expect(await promise).toBeUndefined()
    expect(supportsCount("silent")).toBe(false)
  })

  it("keeps asking a relay that refused until it authenticates", async () => {
    let id
    const sendSpy = vi.fn(m => {
      id = m[1]
    })
    const adapter = new MockAdapter("auth-first", sendSpy)

    const promise = countOne({
      relay: "auth-first",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    adapter.receive(["CLOSED", id, "auth-required: log in first"])

    expect(await promise).toBeUndefined()
    expect(supportsCount("auth-first")).toBeUndefined()
  })

  it("keeps asking a relay that rate limited it", async () => {
    let id
    const sendSpy = vi.fn(m => {
      id = m[1]
    })
    const adapter = new MockAdapter("busy", sendSpy)

    const promise = countOne({
      relay: "busy",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    adapter.receive(["CLOSED", id, "rate-limited: slow down"])

    expect(await promise).toBeUndefined()
    expect(supportsCount("busy")).toBeUndefined()
  })

  it("keeps asking a relay that was still connecting when it went quiet", async () => {
    const socket = new Socket("wss://slow.relay")
    const adapter = new SocketAdapter(socket)

    const promise = countOne({
      relay: "wss://slow.relay",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    vi.advanceTimersByTime(COUNT_TIMEOUT)

    expect(await promise).toBeUndefined()
    expect(supportsCount("wss://slow.relay")).toBeUndefined()

    socket.cleanup()
  })

  it("resolves undefined for an aborted signal without asking", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter("aborted", sendSpy)
    const ctrl = new AbortController()

    ctrl.abort()

    const result = await countOne({
      relay: "aborted",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
      signal: ctrl.signal,
    })

    expect(result).toBeUndefined()
    expect(sendSpy).not.toHaveBeenCalled()
    expect(supportsCount("aborted")).toBeUndefined()
  })
})

describe("count", () => {
  it("takes the highest count any relay gives", async () => {
    const adapters = new Map(
      [
        ["few", 3],
        ["many", 30],
        ["none", undefined],
      ].map(([relay, total]) => {
        const adapter: MockAdapter = new MockAdapter(relay as string, m => {
          const message =
            total === undefined
              ? ["CLOSED", m[1], "unsupported: no NIP-45 here"]
              : ["COUNT", m[1], {count: total}]

          adapter.receive(message)
        })

        return [relay as string, adapter]
      }),
    )

    const result = await count({
      relays: ["few", "many", "none"],
      filters: [{kinds: [1]}],
      context: {getAdapter: (url: string) => adapters.get(url)},
    })

    expect(result).toEqual(30)
  })

  it("resolves undefined when no relay supports count", async () => {
    const adapter: MockAdapter = new MockAdapter("refuses-too", m =>
      adapter.receive(["CLOSED", m[1], "unsupported: no NIP-45 here"]),
    )

    const result = await count({
      relays: ["refuses-too"],
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    expect(result).toBeUndefined()
  })
})
