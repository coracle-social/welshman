import {TaskQueue, defer, noop} from "@welshman/lib"
import {signerCall} from "./util.js"
import type {SignerOptions} from "./util.js"

export type SignerRequest = {
  priority: number
  run: () => Promise<void>
}

/**
 * The lane every request to one signer goes down. A browser extension and a native signer
 * app each answer one request at a time, so a caller is already queueing; making the queue
 * explicit is what lets a signature the user is waiting on overtake a backlog of
 * decryptions, and what keeps one request that never answers from blocking the rest.
 *
 * `batchSize` is 1, since a batch is fixed once it starts and a request arriving mid-batch
 * would otherwise wait out the whole of it however urgent it is. A `batchDelay` of 0 then
 * costs no timer per request, since `TaskQueue` drains a zero delay in a microtask.
 */
export class SignerQueue {
  queue = new TaskQueue<SignerRequest>({
    batchSize: 1,
    batchDelay: 0,
    getPriority: (request: SignerRequest) => request.priority,
    processItem: (request: SignerRequest) => request.run(),
  })

  push = <T>(thunk: () => Promise<T>, options: SignerOptions = {}): Promise<T> => {
    const result = defer<T, Error>()
    const settled = result.then(noop, noop)
    const abort = () => result.reject(new Error("Signer request was aborted"))

    // A signal that is already aborted never fires "abort", so refuse the request here.
    if (options.signal?.aborted) abort()

    options.signal?.addEventListener("abort", abort)
    settled.then(() => options.signal?.removeEventListener("abort", abort))

    this.queue.push({
      priority: options.priority ?? 0,
      run: () => {
        if (!options.signal?.aborted) {
          signerCall(thunk(), options).then(result.resolve, result.reject)
        }

        // The lane is given back when welshman stops waiting, not always when the signer answered
        return settled
      },
    })

    return result
  }
}
