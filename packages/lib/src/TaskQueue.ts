import {remove} from "./Tools.js"

export type TaskQueueOptions<Item> = {
  batchSize: number
  batchDelay: number
  processItem: (item: Item) => unknown
  getPriority?: (item: Item) => number
}

export class TaskQueue<Item> {
  _subs: ((item: Item) => void)[] = []
  items: Item[] = []
  isPaused = false
  isProcessing = false

  constructor(readonly options: TaskQueueOptions<Item>) {}

  push(item: Item) {
    const {getPriority} = this.options

    if (getPriority) {
      const priority = getPriority(item)

      // Items are kept in descending priority order, so binary search for the first one we
      // outrank. A queue that isn't draining — a socket that can't connect, say — grows without
      // bound, and scanning it on every push would make filling it quadratic.
      let lo = 0
      let hi = this.items.length

      while (lo < hi) {
        const mid = (lo + hi) >> 1

        if (getPriority(this.items[mid]) < priority) {
          hi = mid
        } else {
          lo = mid + 1
        }
      }

      // Inserting after the items we tie with keeps equal priorities in fifo order
      this.items.splice(lo, 0, item)
    } else {
      this.items.push(item)
    }

    this.process()
  }

  remove(item: Item) {
    this.items = remove(item, this.items)
  }

  subscribe(subscriber: (item: Item) => void) {
    this._subs.push(subscriber)

    return () => {
      this._subs = remove(subscriber, this._subs)
    }
  }

  process() {
    if (this.isProcessing || this.isPaused || this.items.length === 0) {
      return
    }

    this.isProcessing = true

    setTimeout(async () => {
      if (this.isPaused) {
        this.isProcessing = false
      } else {
        for (const item of this.items.splice(0, this.options.batchSize)) {
          try {
            for (const subscriber of this._subs) {
              subscriber(item)
            }

            await this.options.processItem(item)
          } catch (e) {
            console.error(e)
          }
        }

        this.isProcessing = false

        if (this.items.length > 0) {
          this.process()
        }
      }
    }, this.options.batchDelay)
  }

  stop() {
    this.isPaused = true
  }

  start() {
    this.isPaused = false
    this.process()
  }

  clear() {
    this.items = []
  }
}
