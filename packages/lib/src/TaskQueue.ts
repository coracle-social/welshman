import {yieldThread} from "./Tools.js"

export type TaskQueueOptions<Item> = {
  batchSize: number
  processItem: (item: Item) => unknown
}

export class TaskQueue<Item> {
  items: Item[] = []
  isProcessing = false

  constructor(readonly options: TaskQueueOptions<Item>) {}

  push(item: Item) {
    this.items.push(item)

    if (!this.isProcessing) {
      this.processBatch()
    }
  }

  async processBatch() {
    this.isProcessing = true

    for (const item of this.items.splice(0, this.options.batchSize)) {
      try {
        await this.options.processItem(item)
      } catch (e) {
        console.error(e)
      }
    }

    if (this.items.length > 0) {
      await yieldThread()

      this.processBatch()
    } else {
      this.isProcessing = false
    }
  }

  clear() {
    this.items = []
  }
}
