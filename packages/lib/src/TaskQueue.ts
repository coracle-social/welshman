import {yieldThread} from "./Tools.js"

export type TaskQueueOptions<Item> = {
  batchSize: number
  processItem: (item: Item) => unknown
}

export class TaskQueue<Item> {
  items: Item[] = []
  isPaused = false
  isProcessing = false

  constructor(readonly options: TaskQueueOptions<Item>) {}

  push(item: Item) {
    this.items.push(item)
    this.process()
  }

  async process() {
    if (this.isProcessing || this.isPaused) {
      return
    }

    this.isProcessing = true

    for (const item of this.items.splice(0, this.options.batchSize)) {
      try {
        await this.options.processItem(item)
      } catch (e) {
        console.error(e)
      }
    }

    this.isProcessing = false

    if (this.items.length > 0) {
      await yieldThread()

      this.process()
    }
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
