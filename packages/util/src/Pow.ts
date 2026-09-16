import {call} from "@welshman/lib"
import {matchTag, tagSpec} from "./Tags.js"
import {makeSecret, own, getPubkey, hash} from "./Keys.js"
import {makeEvent, OwnedEvent, HashedEvent} from "./Events.js"

export let benchmark = 0

export const benchmarkDifficulty = 15

export const estimateWork = (difficulty: number) =>
  Math.ceil(benchmark * Math.pow(2, difficulty - benchmarkDifficulty))

const workerCode = `
// Utility function to convert bytes to hex
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Utility function to calculate proof of work from hash
function getPow(id) {
  let count = 0

  for (let i = 0; i < 32; i++) {
    const nibble = id[i]
    if (nibble === 0) {
      count += 8
    } else {
      count += Math.clz32(nibble) - 24
      break
    }
  }

  return count
}

self.onmessage = async function (ev) {
  const {event, difficulty, start = 0, step = 1} = ev.data

  let count = start

  const tag = ["nonce", count.toString(), difficulty.toString()]

  event.tags.push(tag)

  const encoder = new TextEncoder()

  while (true) {
    count += step
    tag[1] = count.toString()

    // Create the event array as specified by NIP-01
    const eventArray = [0, event.pubkey, event.created_at, event.kind, event.tags, event.content]
    const eventString = JSON.stringify(eventArray)

    // Use Web Crypto API for SHA-256 hashing
    const messageBuffer = encoder.encode(eventString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', messageBuffer)
    const hashArray = new Uint8Array(hashBuffer)

    const pow = getPow(hashArray)

    if (pow >= difficulty) {
      event.id = bytesToHex(hashArray)
      break
    }
  }

  postMessage(event)
}
`

const createPowWorker = () => {
  if (typeof Worker === "undefined") {
    throw new Error("Worker is not available in this environment")
  }

  const blob = new Blob([workerCode], {type: "application/javascript"})
  const url = URL.createObjectURL(blob)

  return {worker: new Worker(url), url}
}

export type ProofOfWork = {
  worker: Worker
  result: Promise<HashedEvent>
}

export const makePow = (event: OwnedEvent, difficulty: number): ProofOfWork => {
  const {worker, url} = createPowWorker()

  const result = new Promise<HashedEvent>((resolve, reject) => {
    // Firefox fetches the worker script asynchronously, so revoking the blob url any
    // earlier than this aborts the load and fires an error event with no error on it
    const finish = () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }

    worker.onmessage = (e: MessageEvent<HashedEvent>) => {
      resolve(e.data)
      finish()
    }

    worker.onerror = (e: ErrorEvent) => {
      reject(e.error || new Error("Proof of work worker failed to run"))
      finish()
    }

    worker.postMessage({difficulty, event})
  })

  return {worker, result}
}

// How many leading zero bits an event id opens with, which is NIP-13's measure
// of the work behind it.
export const countLeadingZeroes = (id: string): number => {
  let count = 0

  for (let i = 0; i < id.length; i += 2) {
    const byte = parseInt(id.slice(i, i + 2), 16)

    if (byte === 0) {
      count += 8
    } else {
      count += Math.clz32(byte) - 24
      break
    }
  }

  return count
}

export const getPow = (event: HashedEvent): number => {
  const difficulty = parseInt(matchTag(tagSpec("nonce"), event.tags)?.[2] || "")

  if (isNaN(difficulty)) return 0

  return countLeadingZeroes(event.id) >= difficulty ? difficulty : 0
}

// How many attempts to make between yields. Long enough that the yield is a
// rounding error, short enough that a browser tab stays interactive.
const BATCH = 4096

const yieldToCaller = () => new Promise(resolve => setTimeout(resolve, 0))

// The search `makePow` runs, in whatever is already running it. `makePow` needs
// a `Worker`, which node does not have, so nothing outside a browser can mine.
// Attempts go in batches with a yield between them, so the caller's event loop
// keeps turning through a long search.
//
// A difficulty of zero is no proof of work rather than an easy one, so the
// event comes back hashed and untagged.
export const minePow = async (
  event: OwnedEvent,
  difficulty: number,
  signal?: AbortSignal,
): Promise<HashedEvent> => {
  if (difficulty < 1) return hash(event)

  const tag = ["nonce", "0", difficulty.toString()]
  const candidate = {...event, tags: [...event.tags, tag]}

  let count = 0

  while (true) {
    for (let i = 0; i < BATCH; i++) {
      signal?.throwIfAborted()

      tag[1] = (count++).toString()

      const hashed = hash(candidate)

      if (countLeadingZeroes(hashed.id) >= difficulty) return hashed
    }

    await yieldToCaller()
  }
}

// Generate a simple pow to estimate the device capacities
call(() => {
  // Only run benchmark if Worker is available (browser environment)
  if (typeof Worker === "undefined") {
    return
  }

  const secret = makeSecret()
  const pubkey = getPubkey(secret)
  const event = own(makeEvent(1, {}), pubkey)
  const pow = makePow(event, benchmarkDifficulty)
  const start = Date.now()

  pow.result.then(
    () => {
      benchmark = Date.now() - start
    },
    () => {
      // Leave the benchmark at zero; failures get reported when pow is actually requested
    },
  )
})
