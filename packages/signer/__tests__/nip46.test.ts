import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {makeSecret} from "@welshman/util"
import {Nip01Signer} from "../src/signers/nip01"
import {Nip46Receiver} from "../src/signers/nip46"

const {request} = vi.hoisted(() => ({request: vi.fn()}))

vi.mock("@welshman/net", async importOriginal => ({
  ...(await importOriginal<typeof import("@welshman/net")>()),
  request,
}))

const makeReceiver = () =>
  new Nip46Receiver(Nip01Signer.ephemeral(), {
    relays: ["wss://relay.test/"],
    clientSecret: makeSecret(),
  })

const closeSubscription = () => request.mock.calls.at(-1)![0].onClose()

describe("Nip46Receiver", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    request.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("listens again when its subscription closes", async () => {
    const receiver = makeReceiver()

    await receiver.start()

    expect(request).toHaveBeenCalledTimes(1)

    closeSubscription()

    await vi.advanceTimersByTimeAsync(1000)

    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1][0].filters).toEqual(request.mock.calls[0][0].filters)
  })

  it("waits longer each time the subscription closes right away", async () => {
    const receiver = makeReceiver()

    await receiver.start()
    closeSubscription()
    await vi.advanceTimersByTimeAsync(1000)
    closeSubscription()
    await vi.advanceTimersByTimeAsync(1000)

    expect(request).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1000)

    expect(request).toHaveBeenCalledTimes(3)
  })

  it("starts over after a subscription that lasted", async () => {
    const receiver = makeReceiver()

    await receiver.start()
    closeSubscription()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(60_000)
    closeSubscription()
    await vi.advanceTimersByTimeAsync(1000)

    expect(request).toHaveBeenCalledTimes(3)
  })

  it("stays closed once stopped", async () => {
    const receiver = makeReceiver()

    await receiver.start()
    receiver.stop()
    closeSubscription()

    await vi.advanceTimersByTimeAsync(60_000)

    expect(request).toHaveBeenCalledTimes(1)
  })
})
