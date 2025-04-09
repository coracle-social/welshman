import {describe, it, expect, beforeEach, vi, afterEach} from "vitest"
import {now} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"
import {LocalRelay} from "../src/relay"
import {Repository} from "../src/repository"

describe("LocalRelay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Realistic Nostr data
  const pubkey = "ee".repeat(32)
  const id = "ff".repeat(32)
  const sig = "00".repeat(64)
  const currentTime = now()

  const createEvent = (overrides = {}): TrustedEvent => ({
    id: id,
    pubkey: pubkey,
    created_at: currentTime,
    kind: 1,
    tags: [],
    content: "Hello Nostr!",
    sig: sig,
    ...overrides,
  })

  describe("LocalRelay class", () => {
    let relay: LocalRelay
    let repository: Repository<TrustedEvent>

    beforeEach(() => {
      repository = new Repository<TrustedEvent>()
      relay = new LocalRelay(repository)
    })

    describe("EVENT handling", () => {
      it("should publish events to repository", async () => {
        const event = createEvent()
        const publishSpy = vi.spyOn(repository, "publish")

        relay.send("EVENT", event)

        expect(publishSpy).toHaveBeenCalledWith(event)

        // Should emit OK
        const okHandler = vi.fn()
        relay.on("OK", okHandler)

        // Wait for async operations
        await vi.runAllTimersAsync()

        expect(okHandler).toHaveBeenCalledWith(event.id, true, "")
      })

      it("should notify matching subscribers", async () => {
        const event = createEvent()
        const subId = "test-sub"
        const filter = {kinds: [1]}

        relay.send("REQ", subId, filter)

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledWith(subId, event)
      })

      it("should not notify for deleted events", async () => {
        const event = createEvent()
        repository.removeEvent(event.id)

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).not.toHaveBeenCalled()
      })
    })

    describe("REQ handling", () => {
      it("should handle subscription requests", async () => {
        const event = createEvent()
        repository.publish(event)

        const subId = "test-sub"
        const filter = {kinds: [1]}

        const eventHandler = vi.fn()
        const eoseHandler = vi.fn()

        relay.on("EVENT", eventHandler)
        relay.on("EOSE", eoseHandler)

        relay.send("REQ", subId, filter)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledWith(subId, event)
        expect(eoseHandler).toHaveBeenCalledWith(subId)
      })

      it("should handle multiple filters", async () => {
        const event1 = createEvent({kind: 1})
        const event2 = createEvent({kind: 2, id: "ee".repeat(31)})
        repository.publish(event1)
        repository.publish(event2)

        const subId = "test-sub"
        const filters = [{kinds: [1]}, {kinds: [2]}]

        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("REQ", subId, ...filters)

        await vi.runAllTimersAsync()

        expect(eventHandler).toHaveBeenCalledTimes(2)
      })
    })

    describe("CLOSE handling", () => {
      it("should close subscriptions", async () => {
        const subId = "test-sub"
        relay.send("REQ", subId, {kinds: [1]})
        relay.send("CLOSE", subId)

        await vi.runAllTimersAsync()

        const event = createEvent()
        const eventHandler = vi.fn()
        relay.on("EVENT", eventHandler)

        relay.send("EVENT", event)

        await vi.runAllTimersAsync()

        expect(eventHandler).not.toHaveBeenCalled()
      })
    })
  })
})
