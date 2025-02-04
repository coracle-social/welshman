import {remove} from "./Tools.js"

/** Symbol used to identify global handlers */
const ANY = Symbol("worker/ANY")

/** Configuration options for Worker */
export type WorkerOpts<T> = {
  /** Function to get key for message routing */
  getKey?: (x: T) => any
  /** Function to determine if message processing should be deferred */
  shouldDefer?: (x: T) => boolean
  /** Maximum number of messages to process in one batch */
  chunkSize?: number
  /** Milliseconds to wait between processing batches */
  delay?: number
}

/**
 * Worker for processing messages in batches with throttling
 * @template T - Type of messages to process
 */
export class Worker<T> {
  buffer: T[] = []
  handlers: Map<any, Array<(x: T) => void>> = new Map()
  #timeout: number | undefined
  #paused = false

  constructor(readonly opts: WorkerOpts<T> = {}) {}

  #doWork = async () => {
    const {chunkSize = 50} = this.opts

    for (let i = 0; i < chunkSize; i++) {
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
    const {delay = 50} = this.opts

    if (!this.#paused && !this.#timeout && this.buffer.length > 0) {
      this.#timeout = setTimeout(this.#doWork, delay) as unknown as number
    }
  }

  /**
   * Adds a message to the processing queue
   * @param message - Message to process
   */
  push = (message: T) => {
    this.buffer.push(message)
    this.#enqueueWork()
  }

  /**
   * Adds a handler for messages with specific key
   * @param k - Key to handle
   * @param handler - Function to process matching messages
   */
  addHandler = (k: any, handler: (message: T) => void) => {
    this.handlers.set(k, (this.handlers.get(k) || []).concat(handler))
  }

  /**
   * Removes a handler for messages with specific key
   * @param k - Key to handle
   * @param handler - Function to process matching messages
   */
  removeHandler = (k: any, handler: (message: T) => void) => {
    const newHandlers = remove(handler, this.handlers.get(k) || [])

    if (newHandlers.length > 0) {
      this.handlers.set(k, newHandlers)
    } else {
      this.handlers.delete(k)
    }
  }

  /**
   * Adds a handler for all messages
   * @param handler - Function to process all messages
   */
  addGlobalHandler = (handler: (message: T) => void) => {
    this.addHandler(ANY, handler)
  }

  /**
   * Removes a handler for all messages
   * @param handler - Function to process all messages
   */
  removeGlobalHandler = (handler: (message: T) => void) => {
    this.removeHandler(ANY, handler)
  }

  /** Removes all pending messages from the queue */
  clear() {
    this.buffer = []
  }

  /** Pauses message processing */
  pause() {
    clearTimeout(this.#timeout)

    this.#paused = true
    this.#timeout = undefined
  }

  /** Resumes message processing */
  resume() {
    this.#paused = false
    this.#enqueueWork()
  }
}
