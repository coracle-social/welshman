import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {MockAdapter} from "../src/adapter"
import {ClientMessageType} from "../src/message"
import {diff} from "../src/diff"

describe("diff", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("clears the timeout once the difference closes", async () => {
    let id
    const sendSpy = vi.fn(m => {
      if (m[0] === ClientMessageType.NegOpen) {
        id = m[1]
      }
    })
    const adapter = new MockAdapter("1", sendSpy)

    const promise = diff({
      relays: ["whatever"],
      filters: [{kinds: [1]}],
      events: [],
      context: {getAdapter: () => adapter},
    })

    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBe(1)

    adapter.receive(["NEG-ERR", id, "blocked: nope"])

    await promise

    expect(vi.getTimerCount()).toBe(0)
  })
})
