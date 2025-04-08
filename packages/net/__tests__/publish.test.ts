import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"
import { SinglePublish, MultiPublish, PublishEvent, PublishStatus, } from "../src/publish"
import { AbstractAdapter, AdapterEvent, MockAdapter } from "../src/adapter"
import { ClientMessageType, RelayMessage } from "../src/message"
import { SignedEvent, makeEvent } from "@welshman/util"
import { Nip01Signer } from '@welshman/signer'

describe("SinglePublish", () => {
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

    const pub = new SinglePublish({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()

    pub.on(PublishEvent.Success, successSpy)
    pub.on(PublishEvent.Failure, failureSpy)
    pub.on(PublishEvent.Complete, completeSpy)

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

    const pub = new SinglePublish({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()

    pub.on(PublishEvent.Success, successSpy)
    pub.on(PublishEvent.Failure, failureSpy)
    pub.on(PublishEvent.Complete, completeSpy)

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

    const pub = new SinglePublish({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()
    const timeoutSpy = vi.fn()

    pub.on(PublishEvent.Success, successSpy)
    pub.on(PublishEvent.Failure, failureSpy)
    pub.on(PublishEvent.Complete, completeSpy)
    pub.on(PublishEvent.Timeout, timeoutSpy)

    await vi.runAllTimers()

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    await vi.runAllTimers()

    expect(successSpy).not.toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled()
    expect(completeSpy).toHaveBeenCalled()
    expect(timeoutSpy).toHaveBeenCalled()
  })

  it("abort works", async () => {
    const sendSpy = vi.fn()
    const adapter = new MockAdapter('1', sendSpy)
    const signer = Nip01Signer.ephemeral()
    const event = await signer.sign(makeEvent(1))

    const pub = new SinglePublish({
      relay: '1',
      context: {getAdapter: () => adapter},
      event,
    })

    const successSpy = vi.fn()
    const failureSpy = vi.fn()
    const completeSpy = vi.fn()
    const abortSpy = vi.fn()

    pub.on(PublishEvent.Success, successSpy)
    pub.on(PublishEvent.Failure, failureSpy)
    pub.on(PublishEvent.Complete, completeSpy)
    pub.on(PublishEvent.Timeout, abortSpy)

    await vi.runAllTimers()

    expect(sendSpy).toHaveBeenCalledWith([ClientMessageType.Event, event])

    pub.abort()

    await vi.runAllTimers()

    expect(successSpy).not.toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled()
    expect(completeSpy).toHaveBeenCalled()
    expect(abortSpy).toHaveBeenCalled()
  })
})

describe("MultiPublish", () => {
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

    const pub = new MultiPublish({
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

    pub.on(PublishEvent.Success, successSpy)
    pub.on(PublishEvent.Failure, failureSpy)
    pub.on(PublishEvent.Complete, completeSpy)
    pub.on(PublishEvent.Timeout, timeoutSpy)

    adapter1.receive(["OK", event.id, true, "hi"])
    adapter2.receive(["OK", event.id, false, "hi"])


    await vi.runAllTimers()

    expect(successSpy).toHaveBeenCalledWith(event.id, "hi", "1")
    expect(failureSpy).toHaveBeenCalledWith(event.id, "hi", "2")
    expect(completeSpy).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledWith("3")
  })
})
