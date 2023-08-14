export class Queue {
  timeout?: NodeJS.Timeout
  messages: any[] = []

  clear() {
    this.messages = []
  }

  push(message: any) {
    this.messages.push(message)
    this.enqueueWork()
  }

  handle(message: any) {
    throw new Error("Not implemented")
  }

  shouldSend(message: any) {
    return true
  }

  doWork() {
    for (const message of this.messages.splice(0, 10)) {
      if (this.shouldSend(message)) {
        this.handle(message)
      } else {
        this.messages.push(message)
      }
    }

    this.timeout = undefined
    this.enqueueWork()
  }

  enqueueWork() {
    if (this.timeout) {
      return
    }

    if (this.messages.length === 0) {
      return
    }

    this.timeout = setTimeout(() => this.doWork(), 100) as NodeJS.Timeout
  }
}
