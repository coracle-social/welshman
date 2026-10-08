import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {sleep} from "@welshman/lib"
import {NOTE, makeSecret, getPubkey} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"
import {Nip01Signer, Nip59, SignerQueue, SIGNER_TIMEOUT} from "@welshman/signer"
import type {ISigner, SignerOptions} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Wraps, MAX_UNWRAP_ATTEMPTS, UNWRAP_RETRY_DELAY} from "../src/plugins/wraps.js"

// A signer whose first `failures` decryptions throw, the way a busy or disconnected remote
// signer does. Unwrapping costs two decryptions, so one failure is one lost attempt.
const flakySigner = (secret: string, failures: number, hangs = 0) => {
  const signer = new Nip01Signer(secret)
  let decryptions = 0

  return {
    decryptions: () => decryptions,
    signer: {
      ...signer,
      nip44: {
        encrypt: signer.nip44.encrypt,
        decrypt: async (pubkey: string, message: string) => {
          decryptions++

          if (decryptions <= hangs) {
            return new Promise<string>(() => {})
          }

          if (decryptions <= failures) {
            throw new Error("Signer is busy")
          }

          return signer.nip44.decrypt(pubkey, message)
        },
      },
    } as ISigner,
  }
}

// A signer that answers one request at a time after a delay, the way Nip55Signer does
const slowSigner = (secret: string, delay: number, hangs = 0) => {
  const signer = new Nip01Signer(secret)
  const queue = new SignerQueue()
  const priorities: (number | undefined)[] = []
  let decryptions = 0

  return {
    decryptions: () => decryptions,
    priorities: () => priorities,
    signer: {
      ...signer,
      nip44: {
        encrypt: signer.nip44.encrypt,
        decrypt: (pubkey: string, message: string, options?: SignerOptions) => {
          priorities.push(options?.priority)

          return queue.add(async () => {
            decryptions++

            if (decryptions <= hangs) return new Promise<string>(() => {})

            await sleep(delay)

            return signer.nip44.decrypt(pubkey, message)
          }, options)
        },
      },
    } as ISigner,
  }
}

const makeWrap = (recipient: string) =>
  Nip59.fromSecret(makeSecret()).wrap(recipient, {
    kind: NOTE,
    content: "hi",
    tags: [],
    created_at: Math.round(Date.now() / 1000),
  }) as Promise<SignedEvent>

// Long enough for the queue's 30ms batch delay to run several times over.
const tick = (ms = 500) => vi.advanceTimersByTimeAsync(ms)

describe("wrap unwrapping", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("retries a wrap whose unwrap failed after backing off", async () => {
    const secret = makeSecret()
    const flaky = flakySigner(secret, 1)
    const app = new App({user: await User.fromSigner(flaky.signer)})
    const wrap = await makeWrap(getPubkey(secret))

    app.use(Wraps).enqueue(wrap)

    await tick()

    expect(app.wrapManager.getRumor(wrap.id)).toBeUndefined()
    expect(flaky.decryptions()).toBe(1)

    await tick(UNWRAP_RETRY_DELAY)

    expect(app.wrapManager.getRumor(wrap.id)?.content).toBe("hi")
    expect(flaky.decryptions()).toBe(3)

    app.cleanup()
  })

  it("gives up on a wrap that keeps failing, and refuses to queue it again", async () => {
    const secret = makeSecret()
    const flaky = flakySigner(secret, Infinity)
    const app = new App({user: await User.fromSigner(flaky.signer)})
    const wraps = app.use(Wraps)
    const wrap = await makeWrap(getPubkey(secret))

    wraps.enqueue(wrap)

    await tick(UNWRAP_RETRY_DELAY * 2 ** MAX_UNWRAP_ATTEMPTS)

    expect(app.wrapManager.getRumor(wrap.id)).toBeUndefined()
    expect(flaky.decryptions()).toBe(MAX_UNWRAP_ATTEMPTS)

    wraps.enqueue(wrap)

    await tick(UNWRAP_RETRY_DELAY * 2 ** MAX_UNWRAP_ATTEMPTS)

    expect(flaky.decryptions()).toBe(MAX_UNWRAP_ATTEMPTS)

    app.cleanup()
  })

  it("does not queue a wrap again while it waits on a retry", async () => {
    const secret = makeSecret()
    const flaky = flakySigner(secret, 1)
    const app = new App({user: await User.fromSigner(flaky.signer)})
    const wraps = app.use(Wraps)
    const wrap = await makeWrap(getPubkey(secret))

    wraps.enqueue(wrap)

    await tick()

    wraps.enqueue(wrap)

    await tick()

    expect(flaky.decryptions()).toBe(1)

    app.cleanup()
  })

  it("moves on from a signer that never answers", async () => {
    const secret = makeSecret()
    const slow = slowSigner(secret, 0, 1)
    const app = new App({user: await User.fromSigner(slow.signer)})
    const wraps = app.use(Wraps)
    const stuck = await makeWrap(getPubkey(secret))
    const next = await makeWrap(getPubkey(secret))

    wraps.enqueue(stuck)
    wraps.enqueue(next)

    await tick(SIGNER_TIMEOUT + 500)

    expect(app.wrapManager.getRumor(stuck.id)).toBeUndefined()
    expect(app.wrapManager.getRumor(next.id)?.content).toBe("hi")

    await tick(UNWRAP_RETRY_DELAY)

    expect(app.wrapManager.getRumor(stuck.id)?.content).toBe("hi")

    app.cleanup()
  })

  it("waits out a signer slower than one unwrap may take", async () => {
    const secret = makeSecret()
    // Two decryptions an unwrap, each inside SIGNER_TIMEOUT and the pair of them outside it
    const slow = slowSigner(secret, 20_000)
    const app = new App({user: await User.fromSigner(slow.signer)})
    const wraps = app.use(Wraps)
    const queued = [
      await makeWrap(getPubkey(secret)),
      await makeWrap(getPubkey(secret)),
      await makeWrap(getPubkey(secret)),
    ]

    for (const wrap of queued) {
      wraps.enqueue(wrap)
    }

    await tick(6 * 20_000 + 1000)

    for (const wrap of queued) {
      expect(app.wrapManager.getRumor(wrap.id)?.content).toBe("hi")
    }

    expect(slow.decryptions()).toBe(6)

    app.cleanup()
  })

  it("asks for the back of the signer's queue", async () => {
    const secret = makeSecret()
    const slow = slowSigner(secret, 0)
    const app = new App({user: await User.fromSigner(slow.signer)})
    const wrap = await makeWrap(getPubkey(secret))

    app.use(Wraps).enqueue(wrap)

    await tick()

    expect(app.wrapManager.getRumor(wrap.id)?.content).toBe("hi")
    expect(slow.priorities()).toEqual([-1, -1])

    app.cleanup()
  })

  it("drops pending retries on cleanup", async () => {
    const secret = makeSecret()
    const flaky = flakySigner(secret, 1)
    const app = new App({user: await User.fromSigner(flaky.signer)})
    const wrap = await makeWrap(getPubkey(secret))

    app.use(Wraps).enqueue(wrap)

    await tick()

    app.cleanup()

    await tick(UNWRAP_RETRY_DELAY)

    expect(flaky.decryptions()).toBe(1)
  })
})
