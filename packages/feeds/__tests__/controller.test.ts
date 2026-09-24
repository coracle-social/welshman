import {describe, expect, it, vi} from "vitest"
import {MockAdapter} from "@welshman/net"
import type {ClientMessage} from "@welshman/net"
import {FeedController} from "../src/controller"
import {makeKindFeed} from "../src/utils"

// A relay holding one matching event a minute, so a window width is an event count.
const oneEventPerMinute = (url: string, canCount: boolean) => {
  const sent: ClientMessage[] = []
  const adapter: MockAdapter = new MockAdapter(url, (message: ClientMessage) => {
    const [type, id, filter] = message

    sent.push(message)

    if (type === "REQ") {
      adapter.receive(["EOSE", id])
    }

    if (type === "COUNT") {
      adapter.receive(
        canCount
          ? ["COUNT", id, {count: Math.floor((filter.until - filter.since) / 60)}]
          : ["CLOSED", id, "unsupported: no NIP-45 here"],
      )
    }
  })

  return {adapter, sent}
}

const loadPages = async (url: string, canCount: boolean, pages: number) => {
  const {adapter, sent} = oneEventPerMinute(url, canCount)
  const controller = new FeedController({
    feed: makeKindFeed(1),
    useWindowing: true,
    router: {resolve: vi.fn()},
    context: {getAdapter: () => adapter},
  })

  const load = await controller._getRequestLoader(
    {relays: [url], filters: [{kinds: [1]}]},
    {onEvent: vi.fn(), onExhausted: vi.fn()},
  )

  for (let page = 0; page < pages; page++) {
    await load(10)
  }

  return {
    sent,
    windows: sent
      .filter(([type]) => type === "REQ")
      .map(([_type, _id, filter]) => filter.until - filter.since),
  }
}

describe("FeedController windowing", () => {
  it("does not ask for a count before the first page", async () => {
    const {sent} = await loadPages("wss://unasked.example/", true, 1)

    expect(sent.map(([type]) => type)).toEqual(["REQ", "CLOSE"])
  })

  it("sizes a window from what the relay says is in it", async () => {
    const {windows} = await loadPages("wss://counts.example/", true, 2)
    const [, second] = windows

    expect(windows).toHaveLength(2)
    expect(second / 60).toBeGreaterThanOrEqual(10)
    expect(second / 60).toBeLessThanOrEqual(40)
  })

  it("widens the window exponentially when the relay cannot count", async () => {
    const {windows} = await loadPages("wss://nocounts.example/", false, 2)
    const [first, second] = windows

    expect(second).toEqual(first * 191)
  })
})
