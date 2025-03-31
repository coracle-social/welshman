import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"
import { Unicast, Multicast, PublishEventType, PublishStatus, unicast, multicast } from "../src/publish"
import { AbstractAdapter, AdapterEventType } from "../src/adapter"
import { ClientMessageType, RelayMessage } from "../src/message"
import { SignedEvent, makeEvent } from "@welshman/util"
import { Nip01Signer } from '@welshman/signer'

class MockAdapter extends AbstractAdapter {
  constructor(readonly url: string, readonly send) {
    super()
  }

  get sockets() {
    return []
  }

  get urls() {
    return [this.url]
  }

  receive = (message: RelayMessage) => {
    this.emit(AdapterEventType.Receive, message, this.url)
  }
}

describe("Unicast", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("success works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter('1', sendSpy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = unicast({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()

    pub.on(PublishEventType.Success, successSpy)
    pub.on(PublishEventType.Failure, failureSpy)
    pub.on(PublishEventType.Complete, completeSpy)

    await vi.advanceTimersByTimeAsync(200)

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    adapter.receive(["OK", event.id, true, "hi"])

    await vi.runAllTimers()

    expect(successSpy).toHaveBeenCalledWith(event.id, "hi")
    expect(failureSpy).not.toHaveBeenCalled()
    expect(completeSpy).toHaveBeenCalled()
  })

  it("failure works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter('1', sendSpy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = unicast({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()

    pub.on(PublishEventType.Success, successSpy)
    pub.on(PublishEventType.Failure, failureSpy)
    pub.on(PublishEventType.Complete, completeSpy)

    await vi.advanceTimersByTimeAsync(200)

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    adapter.receive(["OK", event.id, false, "hi"])

    await vi.runAllTimers()

    expect(successSpy).not.toHaveBeenCalled()
    expect(failureSpy).toHaveBeenCalledWith(event.id, "hi")
    expect(completeSpy).toHaveBeenCalled()
  })

  it("timeout works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter('1', sendSpy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = unicast({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()
    const timeoutSpy = vi.fn()

    pub.on(PublishEventType.Success, successSpy)
    pub.on(PublishEventType.Failure, failureSpy)
    pub.on(PublishEventType.Complete, completeSpy)
    pub.on(PublishEventType.Timeout, timeoutSpy)

    await vi.runAllTimers(200)

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    await vi.runAllTimers()

    expect(successSpy).not.toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled(event.id, "hi")
    expect(completeSpy).toHaveBeenCalled()
    expect(timeoutSpy).toHaveBeenCalled()
  })

  it("abort works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter('1', sendSpy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = unicast({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()
    const abortSpy = vi.fn()

    pub.on(PublishEventType.Success, successSpy)
    pub.on(PublishEventType.Failure, failureSpy)
    pub.on(PublishEventType.Complete, completeSpy)
    pub.on(PublishEventType.Timeout, abortSpy)

    await vi.runAllTimers(200)

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    pub.abort()

    await vi.runAllTimers()

    expect(successSpy).not.toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled(event.id, "hi")
    expect(completeSpy).toHaveBeenCalled()
    expect(abortSpy).toHaveBeenCalled()
  })
})

describe("Multicast", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should all basically work", async () => {
    const send1Spy = vi.fn()
    const adapter1 = new MockAdapter('1', send1Spy)
    const send2Spy = vi.fn()
    const adapter2 = new MockAdapter('2', send2Spy)
    const send3Spy = vi.fn()
    const adapter3 = new MockAdapter('3', send3Spy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = multicast({
      event,
      relays: ['1', '2', '3'],
      context: {
        getAdapter: (url: string) => {
          switch(url) {
            case '1': return adapter1
            case '2': return adapter2
            case '3': return adapter3
            default: throw new Error(`Unknown relay: ${url}`)
          }
        },
      }
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()
    const timeoutSpy = vi.fn()

    pub.on(PublishEventType.Success, successSpy)
    pub.on(PublishEventType.Failure, failureSpy)
    pub.on(PublishEventType.Complete, completeSpy)
    pub.on(PublishEventType.Timeout, timeoutSpy)

    adapter1.receive(["OK", event.id, true, "hi"])
    adapter2.receive(["OK", event.id, false, "hi"])


    await vi.runAllTimers()

    expect(successSpy).toHaveBeenCalledWith(event.id, "hi", "1")
    expect(failureSpy).toHaveBeenCalledWith(event.id, "hi", "2")
    expect(completeSpy).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledWith("3")
  })
})
