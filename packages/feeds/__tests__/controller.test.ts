import {describe, expect, it, vi} from "vitest"
import {EPOCH, makeEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
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

describe("FeedController exhaustion", () => {
  it("keeps going after a full page that reaches back to the start", async () => {
    const signer = Nip01Signer.ephemeral()
    const reqs: ClientMessage[] = []
    const onExhausted = vi.fn()

    // Answers every count with 0, which sends the window straight back to the epoch, but
    // holds an event a minute so every page comes back full
    const adapter: MockAdapter = new MockAdapter("wss://undercounts.example/", async message => {
      const [type, id, filter] = message

      if (type === "COUNT") {
        adapter.receive(["COUNT", id, {count: 0}])
      }

      if (type === "REQ") {
        reqs.push(message)

        for (let i = 0; i < filter.limit; i++) {
          const event = await signer.sign(makeEvent(1, {created_at: filter.until - i * 60}))

          adapter.receive(["EVENT", id, event])
        }

        adapter.receive(["EOSE", id])
      }
    })

    const controller = new FeedController({
      feed: makeKindFeed(1),
      useWindowing: true,
      router: {resolve: vi.fn()},
      context: {getAdapter: () => adapter},
    } as any)

    const load = await controller._getRequestLoader(
      {relays: ["wss://undercounts.example/"], filters: [{kinds: [1]}]},
      {onEvent: vi.fn(), onExhausted},
    )

    while (reqs.length < 10 && reqs.at(-1)?.[2].since !== EPOCH) {
      await load(10)
    }

    expect(reqs.at(-1)![2].since).toEqual(EPOCH)

    const before = reqs.length

    await load(10)

    expect(onExhausted).not.toHaveBeenCalled()
    expect(reqs).toHaveLength(before + 1)
  })

  it("loads again after a page fails", async () => {
    const {adapter, sent} = oneEventPerMinute("wss://flaky.example/", false)
    let calls = 0

    const controller = new FeedController({
      feed: makeKindFeed(1),
      useWindowing: true,
      router: {resolve: vi.fn()},
      context: {
        getAdapter: () => {
          calls += 1

          if (calls === 1) {
            throw new Error("No adapter yet")
          }

          return adapter
        },
      },
    } as any)

    const load = await controller._getRequestLoader(
      {relays: ["wss://flaky.example/"], filters: [{kinds: [1]}]},
      {onEvent: vi.fn(), onExhausted: vi.fn()},
    )

    await expect(load(10)).rejects.toThrow("No adapter yet")
    await load(10)

    expect(sent.filter(([type]) => type === "REQ")).toHaveLength(1)
  })
})
