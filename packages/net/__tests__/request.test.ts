import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {Nip01Signer} from "@welshman/signer"
import {makeEvent} from "@welshman/util"
import {ClientMessageType} from "../src/message"
import {MockAdapter} from "../src/adapter"
import {requestOne, request} from "../src/request"

describe("requestOne", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("everything basically works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter("1", sendSpy)
    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    requestOne({
      relay: "whatever",
      filters: [{kinds: [1]}],
      context: {getAdapter: () => adapter},
      onDuplicate: duplicateSpy,
      onInvalid: invalidSpy,
      onFiltered: filteredSpy,
      onEvent: eventSpy,
      onEose: eoseSpy,
      onClose: closeSpy,
    })

    await vi.runAllTimersAsync()

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Req, expect.any(String), {kinds: [1]}])

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

describe("request", () => {
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
    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    request({
      relays: ["1", "2"],
      filters: [{kinds: [1]}],
      context: {
        getAdapter: (url: string) => (url === "1" ? adapter1 : adapter2),
      },
      onDuplicate: duplicateSpy,
      onInvalid: invalidSpy,
      onFiltered: filteredSpy,
      onEvent: eventSpy,
      onEose: eoseSpy,
      onClose: closeSpy,
    })

    await vi.runAllTimersAsync()

    expect(send1Spy).toHaveBeenCalledTimes(1)
    expect(send2Spy).toHaveBeenCalledTimes(1)

    const signer = Nip01Signer.ephemeral()
    const event1 = await signer.sign(makeEvent(1))
    const event2 = await signer.sign(makeEvent(7))
    const event3 = makeEvent(1)
    const event4 = await signer.sign(makeEvent(1))

    adapter1.receive(["EVENT", expect.any(String), event1])
    adapter1.receive(["EVENT", expect.any(String), event2])
    adapter1.receive(["EVENT", expect.any(String), event3])
    adapter2.receive(["EVENT", expect.any(String), event1])
    adapter2.receive(["EVENT", expect.any(String), event4])

    await vi.runAllTimersAsync()

    expect(duplicateSpy).toHaveBeenCalledWith(event1, "2")
    expect(filteredSpy).toHaveBeenCalledWith(event2, "1")
    expect(invalidSpy).toHaveBeenCalledWith(event3, "1")
    expect(eventSpy).toHaveBeenCalledWith(event1, "1")
    expect(eoseSpy).toHaveBeenCalledTimes(0)

    adapter1.receive(["EOSE", expect.any(String)])
    adapter2.receive(["EOSE", expect.any(String)])

    expect(eoseSpy).toHaveBeenCalledTimes(2)

    req.close()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
