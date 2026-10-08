import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {sleep} from "@welshman/lib"
import {SignerQueue} from "../src/queue.js"
import {SIGNER_TIMEOUT} from "../src/util.js"

describe("SignerQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("answers one request at a time", async () => {
    const queue = new SignerQueue()
    const concurrency: number[] = []
    let running = 0

    const request = (name: string) =>
      queue.push(async () => {
        running++
        concurrency.push(running)

        await sleep(100)

        running--

        return name
      })

    const answers = Promise.all([request("one"), request("two"), request("three")])

    await vi.advanceTimersByTimeAsync(1000)

    expect(await answers).toEqual(["one", "two", "three"])
    expect(concurrency).toEqual([1, 1, 1])
  })

  it("lets a request overtake a backlog that asked for the back of the line", async () => {
    const queue = new SignerQueue()
    const answered: string[] = []

    const request = (name: string, priority: number) =>
      queue.push(
        async () => {
          await sleep(100)

          answered.push(name)

          return name
        },
        {priority},
      )

    const backlog = Array.from({length: 20}, (_, i) => request(`decrypt ${i}`, -1))

    // The first decryption is already running by the time the signature is asked for
    await vi.advanceTimersByTimeAsync(10)

    const signature = request("sign", 0)

    await vi.advanceTimersByTimeAsync(10_000)
    await Promise.all([...backlog, signature])

    expect(answered.slice(0, 3)).toEqual(["decrypt 0", "sign", "decrypt 1"])
  })

  it("gives the lane back when a request is never answered", async () => {
    const queue = new SignerQueue()
    const stuck = queue.push(() => new Promise<string>(() => {}))
    const next = queue.push(async () => "answered")
    const settled = Promise.allSettled([stuck, next])

    await vi.advanceTimersByTimeAsync(SIGNER_TIMEOUT + 100)

    const [first, second] = await settled

    expect(first.status).toBe("rejected")
    expect(second).toEqual({status: "fulfilled", value: "answered"})
  })

  it("drops a request aborted before the signer sees it", async () => {
    const queue = new SignerQueue()
    const controller = new AbortController()
    let calls = 0

    const blocking = queue.push(async () => {
      await sleep(100)

      return "first"
    })

    const aborted = queue.push(
      async () => {
        calls++

        return "second"
      },
      {signal: controller.signal},
    )

    const settled = Promise.allSettled([blocking, aborted])

    controller.abort()

    await vi.advanceTimersByTimeAsync(1000)

    const [first, second] = await settled

    expect(first).toEqual({status: "fulfilled", value: "first"})
    expect(second.status).toBe("rejected")
    expect(calls).toBe(0)
  })

  it("refuses a request whose signal is already aborted without blocking the lane", async () => {
    const queue = new SignerQueue()
    let calls = 0

    const refused = queue.push(
      async () => {
        calls++
      },
      {signal: AbortSignal.abort()},
    )

    await expect(refused).rejects.toThrow("Signer request was aborted")
    await expect(queue.push(async () => "next")).resolves.toBe("next")
    expect(calls).toBe(0)
  })

  it("settles a request that throws instead of rejecting", async () => {
    const queue = new SignerQueue()

    const thrown = queue.push((): Promise<string> => {
      throw new Error("no extension")
    })

    await expect(thrown).rejects.toThrow("no extension")
    await expect(queue.push(async () => "next")).resolves.toBe("next")
  })
})
