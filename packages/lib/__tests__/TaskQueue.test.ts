import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {TaskQueue, TaskQueueOptions} from "../src/TaskQueue"

describe("TaskQueue", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const makeQueue = (options: Partial<TaskQueueOptions<number>> = {}) => {
    const processed: number[] = []
    const queue = new TaskQueue<number>({
      batchSize: 10,
      batchDelay: 10,
      processItem: (item: number) => {
        processed.push(item)
      },
      ...options,
    })

    return {queue, processed}
  }

  it("should process items in fifo order by default", async () => {
    const {queue, processed} = makeQueue()

    queue.stop()
    ;[1, 2, 3].forEach(item => queue.push(item))
    queue.start()

    await vi.runAllTimersAsync()

    expect(processed).toEqual([1, 2, 3])
  })

  it("should process higher priority items first when getPriority is given", async () => {
    const priorities = new Map([
      [1, 0],
      [2, 5],
      [3, 0],
      [4, 5],
      [5, 10],
    ])

    const {queue, processed} = makeQueue({getPriority: (item: number) => priorities.get(item)!})

    queue.stop()
    ;[1, 2, 3, 4, 5].forEach(item => queue.push(item))
    queue.start()

    await vi.runAllTimersAsync()

    // Highest priority first, and items of equal priority keep their relative order
    expect(processed).toEqual([5, 2, 4, 1, 3])
  })

  it("should keep a large queue in stable priority order", async () => {
    // Enough items to exercise the binary search, with plenty of ties at each priority
    const items = Array.from({length: 500}, (_, i) => i)
    const priorityOf = (item: number) => item % 5

    const {queue, processed} = makeQueue({
      batchSize: 500,
      getPriority: priorityOf,
    })

    queue.stop()
    items.forEach(item => queue.push(item))
    queue.start()

    await vi.runAllTimersAsync()

    // A stable sort by descending priority: ties keep the order they were pushed in
    const expected = [...items].sort((a, b) => priorityOf(b) - priorityOf(a))

    expect(processed).toEqual(expected)
  })

  it("should place items pushed mid-drain according to priority", async () => {
    const priorities = new Map([
      [1, 0],
      [2, 0],
      [3, 100],
    ])

    const {queue, processed} = makeQueue({
      batchSize: 1,
      getPriority: (item: number) => priorities.get(item)!,
    })

    queue.stop()
    queue.push(1)
    queue.push(2)
    queue.start()

    // Let the first batch through, then enqueue something urgent
    await vi.advanceTimersByTimeAsync(10)
    queue.push(3)
    await vi.runAllTimersAsync()

    expect(processed).toEqual([1, 3, 2])
  })
})
