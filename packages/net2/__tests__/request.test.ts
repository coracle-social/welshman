import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { Nip01Signer } from '@welshman/signer'
import { LOCAL_RELAY_URL, makeEvent } from '@welshman/util'
import { ClientMessageType } from "../src/message"
import { AdapterContext, AbstractAdapter, AdapterEventType } from "../src/adapter"
import { unireq, multireq, RequestEventType } from "../src/request"
import { Tracker } from "../src/tracker"

class MockAdapter extends AbstractAdapter {
  constructor(readonly send) {
    super()

    this.sockets = []
    this.urls = [LOCAL_RELAY_URL]
  }

  receive = (message: RelayMessage) => {
    this.emit(AdapterEventType.Receive, message, this.url)
  }
}

describe("Unireq", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it("everything basically works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter(sendSpy)
    const req = unireq({
      relay: 'whatever',
      filter: {kinds: [1]},
      context: {getAdapter: () => adapter},
      autoClose: true,
    })

    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    req.on(RequestEventType.Duplicate, duplicateSpy)
    req.on(RequestEventType.Invalid, invalidSpy)
    req.on(RequestEventType.Filtered, filteredSpy)
    req.on(RequestEventType.Event, eventSpy)
    req.on(RequestEventType.Eose, eoseSpy)
    req.on(RequestEventType.Close, closeSpy)

    await vi.runAllTimers()

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Req, req._id, {kinds: [1]}])

    const signer = Nip01Signer.ephemeral()
    const event1 = await signer.sign(makeEvent(1))
    const event2 = await signer.sign(makeEvent(7))
    const event3 = makeEvent(1)

    adapter.receive(["EVENT", req._id, event1])
    adapter.receive(["EVENT", req._id, event2])
    adapter.receive(["EVENT", req._id, event1])
    adapter.receive(["EVENT", req._id, event3])

    await vi.runAllTimers()

    expect(duplicateSpy).toHaveBeenCalledWith(event1)
    expect(filteredSpy).toHaveBeenCalledWith(event2)
    expect(invalidSpy).toHaveBeenCalledWith(event3)
    expect(eventSpy).toHaveBeenCalledWith(event1)
    expect(eoseSpy).toHaveBeenCalledTimes(0)

    adapter.receive(["EOSE", req._id])

    expect(eoseSpy).toHaveBeenCalledTimes(1)
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

describe("Multireq", () => {
  it("everything basically works", async () => {
    const send1Spy = vi.fn()
    const adapter1 = new MockAdapter(send1Spy)
    const send2Spy = vi.fn()
    const adapter2 = new MockAdapter(send2Spy)
    const req = multireq({
      autoClose: true,
      relays: ['1', '2'],
      filter: {kinds: [1]},
      context: {
        getAdapter: (url: string) => url === '1' ? adapter1 : adapter2
      },
    })

    const duplicateSpy = vi.fn()
    const invalidSpy = vi.fn()
    const filteredSpy = vi.fn()
    const eventSpy = vi.fn()
    const eoseSpy = vi.fn()
    const closeSpy = vi.fn()

    req.on(RequestEventType.Duplicate, duplicateSpy)
    req.on(RequestEventType.Invalid, invalidSpy)
    req.on(RequestEventType.Filtered, filteredSpy)
    req.on(RequestEventType.Event, eventSpy)
    req.on(RequestEventType.Eose, eoseSpy)
    req.on(RequestEventType.Close, closeSpy)

    await vi.runAllTimers()

    expect(send1Spy).toHaveBeenCalledWith([ClientMessageType.Req, req._children[0]._id, {kinds: [1]}])
    expect(send2Spy).toHaveBeenCalledWith([ClientMessageType.Req, req._children[1]._id, {kinds: [1]}])

    const signer = Nip01Signer.ephemeral()
    const event1 = await signer.sign(makeEvent(1))
    const event2 = await signer.sign(makeEvent(7))
    const event3 = makeEvent(1)
    const event4 = await signer.sign(makeEvent(1))

    adapter1.receive(["EVENT", req._children[0]._id, event1])
    adapter1.receive(["EVENT", req._children[0]._id, event2])
    adapter1.receive(["EVENT", req._children[0]._id, event3])
    adapter2.receive(["EVENT", req._children[1]._id, event1])
    adapter2.receive(["EVENT", req._children[1]._id, event4])

    await vi.runAllTimers()

    expect(duplicateSpy).toHaveBeenCalledWith(event1, '2')
    expect(filteredSpy).toHaveBeenCalledWith(event2, '1')
    expect(invalidSpy).toHaveBeenCalledWith(event3, '1')
    expect(eventSpy).toHaveBeenCalledWith(event1, '1')
    expect(eoseSpy).toHaveBeenCalledTimes(0)

    adapter1.receive(["EOSE", req._children[0]._id])
    adapter2.receive(["EOSE", req._children[1]._id])

    expect(eoseSpy).toHaveBeenCalledTimes(2)
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

