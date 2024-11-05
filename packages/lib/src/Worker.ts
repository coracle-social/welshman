const ANY = Symbol("worker/ANY")

export type WorkerOpts<T> = {
  getKey?: (x: T) => any
  shouldDefer?: (x: T) => boolean
}

export class Worker<T> {
  buffer: T[] = []
  handlers: Map<any, Array<(x: T) => void>> = new Map()
  #timeout: number | undefined
  #paused = false

  constructor(readonly opts: WorkerOpts<T> = {}) {}

  #doWork = async () => {
    for (let i = 0; i < 50; i++) {
      if (this.buffer.length === 0) {
        break
      }

      // Pop the buffer one at a time so handle can modify the queue
      const [message] = this.buffer.splice(0, 1)

      if (this.opts.shouldDefer?.(message)) {
        this.buffer.push(message)
      } else {
        for (const handler of this.handlers.get(ANY) || []) {
          try {
            await handler(message)
          } catch (e) {
            console.error(e)
          }
        }

        if (this.opts.getKey) {
          const k = this.opts.getKey(message)

          for (const handler of this.handlers.get(k) || []) {
            try {
              await handler(message)
            } catch (e) {
              console.error(e)
            }
          }
        }
      }
    }

    this.#timeout = undefined
    this.#enqueueWork()
  }

  #enqueueWork = () => {
    if (!this.#paused && !this.#timeout && this.buffer.length > 0) {
      this.#timeout = setTimeout(this.#doWork, 50) as unknown as number
    }
  }

  push = (message: T) => {
    this.buffer.push(message)
    this.#enqueueWork()
  }

  addHandler = (k: any, handler: (message: T) => void) => {
    this.handlers.set(k, (this.handlers.get(k) || []).concat(handler))
  }

  addGlobalHandler = (handler: (message: T) => void) => {
    this.addHandler(ANY, handler)
  }

  clear() {
    this.buffer = []
  }

  pause() {
    clearTimeout(this.#timeout)

    this.#paused = true
    this.#timeout = undefined
  }

  resume() {
    this.#paused = false
    this.#enqueueWork()
  }
}
