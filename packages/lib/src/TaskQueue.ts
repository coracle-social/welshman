import {remove, yieldThread} from "./Tools.js"

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

  remove(item: Item) {
    this.items = remove(item, this.items)
  }

  async process() {
    if (this.isProcessing || this.isPaused || this.items.length == 0) {
      return
    }

    this.isProcessing = true

    await yieldThread()

    for (const item of this.items.splice(0, this.options.batchSize)) {
      try {
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
