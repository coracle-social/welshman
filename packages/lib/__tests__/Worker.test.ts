import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {Worker} from "../src/Worker"

describe("Worker", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should process messages in batches", async () => {
    const handler = vi.fn()
    const worker = new Worker<number>()

    worker.addGlobalHandler(handler)

    // Push messages
    worker.push(1)
    worker.push(2)
    worker.push(3)

    // Initially no processing
    expect(handler).not.toHaveBeenCalled()

    // Advance timer to trigger processing
    await vi.advanceTimersByTimeAsync(50)

    expect(handler).toHaveBeenCalledTimes(3)
    expect(handler).toHaveBeenNthCalledWith(1, 1)
    expect(handler).toHaveBeenNthCalledWith(2, 2)
    expect(handler).toHaveBeenNthCalledWith(3, 3)
  })

  it("should respect chunkSize option", async () => {
    const handler = vi.fn()
    const worker = new Worker<number>({chunkSize: 2})

    worker.addGlobalHandler(handler)

    // Push more messages than chunkSize
    worker.push(1)
    worker.push(2)
    worker.push(3)

    // First batch
    await vi.advanceTimersByTimeAsync(50)
    expect(handler).toHaveBeenCalledTimes(2)

    // Second batch
    await vi.advanceTimersByTimeAsync(50)
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it("should handle message routing by key", async () => {
    const globalHandler = vi.fn()
    const evenHandler = vi.fn()
    const oddHandler = vi.fn()

    const worker = new Worker<number>({
      getKey: x => (x % 2 === 0 ? "even" : "odd"),
    })

    worker.addGlobalHandler(globalHandler)
    worker.addHandler("even", evenHandler)
    worker.addHandler("odd", oddHandler)

    worker.push(1)
    worker.push(2)

    await vi.advanceTimersByTimeAsync(50)

    expect(globalHandler).toHaveBeenCalledTimes(2)
    expect(evenHandler).toHaveBeenCalledWith(2)
    expect(oddHandler).toHaveBeenCalledWith(1)
  })

  it("should handle message deferral", async () => {
    const handler = vi.fn()
    let shouldDefer = true

    const worker = new Worker<number>({
      shouldDefer: () => shouldDefer,
    })

    worker.addGlobalHandler(handler)
    worker.push(1)

    // Message should be deferred
    await vi.advanceTimersByTimeAsync(50)
    expect(handler).not.toHaveBeenCalled()

    // Allow processing
    shouldDefer = false
    await vi.advanceTimersByTimeAsync(50)
    expect(handler).toHaveBeenCalledWith(1)
  })

  it("should handle multiple handlers for same key", async () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()

    const worker = new Worker<number>({
      getKey: () => "test",
    })

    worker.addHandler("test", handler1)
    worker.addHandler("test", handler2)

    worker.push(1)

    await vi.advanceTimersByTimeAsync(50)

    expect(handler1).toHaveBeenCalledWith(1)
    expect(handler2).toHaveBeenCalledWith(1)
  })

  it("should handle errors in handlers gracefully", async () => {
    const consoleError = vi.spyOn(console, "error")
    const errorHandler = vi.fn(() => {
      throw new Error("Test error")
    })
    const nextHandler = vi.fn()

    const worker = new Worker<number>()
    worker.addGlobalHandler(errorHandler)
    worker.addGlobalHandler(nextHandler)

    worker.push(1)

    await vi.advanceTimersByTimeAsync(50)

    expect(consoleError).toHaveBeenCalled()
    expect(nextHandler).toHaveBeenCalled()
  })

  describe("control methods", () => {
    it("should clear the buffer", async () => {
      const handler = vi.fn()
      const worker = new Worker<number>()

      worker.addGlobalHandler(handler)
      worker.push(1)
      worker.push(2)

      worker.clear()

      await vi.advanceTimersByTimeAsync(50)
      expect(handler).not.toHaveBeenCalled()
    })

    it("should pause and resume processing", async () => {
      const handler = vi.fn()
      const worker = new Worker<number>()

      worker.addGlobalHandler(handler)
      worker.push(1)

      worker.pause()
      await vi.advanceTimersByTimeAsync(50)
      expect(handler).not.toHaveBeenCalled()

      worker.resume()
      await vi.advanceTimersByTimeAsync(50)
      expect(handler).toHaveBeenCalled()
    })

    it("should respect custom delay option", async () => {
      const handler = vi.fn()
      const worker = new Worker<number>({delay: 100})

      worker.addGlobalHandler(handler)
      worker.push(1)

      await vi.advanceTimersByTimeAsync(50)
      expect(handler).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(50) // Total 100ms
      expect(handler).toHaveBeenCalled()
    })
  })

  describe("async handlers", () => {
    it("should wait for async handlers to complete", async () => {
      const results: number[] = []
      const asyncHandler = vi.fn(async (x: number) => {
        await new Promise(resolve => setTimeout(resolve, 100))
        results.push(x)
      })

      const worker = new Worker<number>()
      worker.addGlobalHandler(asyncHandler)

      worker.push(1)
      worker.push(2)

      await vi.advanceTimersByTimeAsync(50) // Trigger processing
      await vi.advanceTimersByTimeAsync(100) // Wait for one async handlers

      expect(results).toEqual([1])

      await vi.advanceTimersByTimeAsync(100) // Wait for another async handlers

      expect(results).toEqual([1, 2])
    })
  })
})
