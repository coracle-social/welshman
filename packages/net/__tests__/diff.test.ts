import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {sleep} from "@welshman/lib"
import {Nip01Signer} from "@welshman/signer"
import {SignedEvent, makeEvent} from "@welshman/util"
import {MockAdapter} from "../src/adapter"
import {ClientMessageType, RelayMessageType} from "../src/message"
import {Negentropy, NegentropyStorageVector} from "../src/negentropy"
import {diff, pull} from "../src/diff"

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

const url = "wss://example.com/"

const makeRelay = (events: SignedEvent[]) => {
  const eventsById = new Map(events.map(event => [event.id, event]))
  const requestedIds: string[][] = []

  let openRequests = 0
  let maxOpenRequests = 0

  const getAdapter = () => {
    const storage = new NegentropyStorageVector()

    for (const event of events) {
      storage.insert(event.created_at, event.id)
    }

    storage.seal()

    const neg = new Negentropy(storage, 50_000)
    const adapter: MockAdapter = new MockAdapter(url, async message => {
      if (message[0] === ClientMessageType.NegOpen) {
        const [_, negid, __, msg] = message
        const [response] = await neg.reconcile(msg)

        adapter.receive([RelayMessageType.NegMsg, negid, response as string])
      }

      if (message[0] === ClientMessageType.Req) {
        const [_, subid, filter] = message
        const ids = filter.ids!

        requestedIds.push(ids)
        openRequests += 1
        maxOpenRequests = Math.max(maxOpenRequests, openRequests)

        await sleep(10)

        for (const id of ids) {
          adapter.receive([RelayMessageType.Event, subid, eventsById.get(id)!])
        }

        openRequests -= 1
        adapter.receive([RelayMessageType.Eose, subid])
      }
    })

    return adapter
  }

  return {
    getAdapter,
    requestedIds,
    getMaxOpenRequests: () => maxOpenRequests,
  }
}

describe("pull", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("asks for the newest events first, a couple of requests at a time", async () => {
    const signer = Nip01Signer.ephemeral()
    const events: SignedEvent[] = []

    for (let i = 0; i < 250; i++) {
      events.push(await signer.sign(makeEvent(1, {created_at: 1700000000 + i})))
    }

    const relay = makeRelay(events)
    const ids = events.map(event => event.id)
    const promise = pull({
      relays: [url],
      filters: [{kinds: [1]}],
      events: [],
      context: {getAdapter: relay.getAdapter},
    })

    await vi.runAllTimersAsync()

    const result = await promise

    expect(relay.requestedIds).toEqual([ids.slice(200), ids.slice(100, 200), ids.slice(0, 100)])
    expect(relay.getMaxOpenRequests()).toBe(2)
    expect(result.map(event => event.id).sort()).toEqual(ids.slice().sort())
  })
})
