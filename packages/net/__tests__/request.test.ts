import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Nip01Signer} from "@welshman/signer"
import {makeEvent} from "@welshman/util"
import {ClientMessageType} from "../src/message"
import {MockAdapter} from "../src/adapter"
import {SingleRequest, MultiRequest, RequestEvent} from "../src/request"

describe("SingleRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("everything basically works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter("1", sendSpy)
    const req = new SingleRequest({
      relay: "whatever",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
    })

    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    req.on(RequestEvent.Duplicate, duplicateSpy)
    req.on(RequestEvent.Invalid, invalidSpy)
    req.on(RequestEvent.Filtered, filteredSpy)
    req.on(RequestEvent.Event, eventSpy)
    req.on(RequestEvent.Eose, eoseSpy)
    req.on(RequestEvent.Close, closeSpy)

    await vi.runAllTimersAsync()

    const id = Array.from(req._ids)[0]

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Req, id, {kinds: [1]}])

    const signer = Nip01Signer.ephemeral()
    const event1 = await signer.sign(makeEvent(1))
    const event2 = await signer.sign(makeEvent(7))
    const event3 = makeEvent(1)

    adapter.receive(["EVENT", id, event1])
    adapter.receive(["EVENT", id, event2])
    adapter.receive(["EVENT", id, event1])
    adapter.receive(["EVENT", id, event3])

    await vi.runAllTimersAsync()

    expect(duplicateSpy).toHaveBeenCalledWith(event1)
    expect(filteredSpy).toHaveBeenCalledWith(event2)
    expect(invalidSpy).toHaveBeenCalledWith(event3)
    expect(eventSpy).toHaveBeenCalledWith(event1)
    expect(eoseSpy).toHaveBeenCalledTimes(0)

    adapter.receive(["EOSE", id])

    expect(eoseSpy).toHaveBeenCalledTimes(1)

    req.close()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

describe("MultiRequest", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("everything basically works", async () => {
    const send1Spy = vi.fn()
    const adapter1 = new MockAdapter("1", send1Spy)
    const send2Spy = vi.fn()
    const adapter2 = new MockAdapter("2", send2Spy)
    const req = new MultiRequest({
      relays: ["1", "2"],
      filters: [{kinds: [1]}],
      context: {
        getAdapter: (url: string) => (url === "1" ? adapter1 : adapter2),
      },
    })

    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    req.on(RequestEvent.Duplicate, duplicateSpy)
    req.on(RequestEvent.Invalid, invalidSpy)
    req.on(RequestEvent.Filtered, filteredSpy)
    req.on(RequestEvent.Event, eventSpy)
    req.on(RequestEvent.Eose, eoseSpy)
    req.on(RequestEvent.Close, closeSpy)

    await vi.runAllTimersAsync()

    const id1 = Array.from(req._children[0]._ids)[0]
    const id2 = Array.from(req._children[1]._ids)[0]

    expect(send1Spy).toHaveBeenCalledWith([ClientMessageType.Req, id1, {kinds: [1]}])
    expect(send2Spy).toHaveBeenCalledWith([ClientMessageType.Req, id2, {kinds: [1]}])

    const signer = Nip01Signer.ephemeral()
    const event1 = await signer.sign(makeEvent(1))
    const event2 = await signer.sign(makeEvent(7))
    const event3 = makeEvent(1)
    const event4 = await signer.sign(makeEvent(1))

    adapter1.receive(["EVENT", id1, event1])
    adapter1.receive(["EVENT", id1, event2])
    adapter1.receive(["EVENT", id1, event3])
    adapter2.receive(["EVENT", id2, event1])
    adapter2.receive(["EVENT", id2, event4])

    await vi.runAllTimersAsync()

    expect(duplicateSpy).toHaveBeenCalledWith(event1, "2")
    expect(filteredSpy).toHaveBeenCalledWith(event2, "1")
    expect(invalidSpy).toHaveBeenCalledWith(event3, "1")
    expect(eventSpy).toHaveBeenCalledWith(event1, "1")
    expect(eoseSpy).toHaveBeenCalledTimes(0)

    adapter1.receive(["EOSE", id1])
    adapter2.receive(["EOSE", id2])

    expect(eoseSpy).toHaveBeenCalledTimes(2)

    req.close()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
