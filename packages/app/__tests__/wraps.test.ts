import {describe, it, expect} from "vitest"
import {sleep} from "@welshman/lib"
import {NOTE, makeSecret, getPubkey} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"
import {Nip01Signer, Nip59} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Wraps, MAX_UNWRAP_ATTEMPTS} from "../src/plugins/wraps.js"

// A signer whose first `failures` decryptions throw, the way a busy or disconnected remote
// signer does. Unwrapping costs two decryptions, so one failure is one lost attempt.
const flakySigner = (secret: string, failures: number) => {
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

          if (decryptions <= failures) {
            throw new Error("Signer is busy")
          }

          return signer.nip44.decrypt(pubkey, message)
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
const tick = () => sleep(500)

describe("wrap unwrapping", () => {
  it("retries a wrap whose unwrap failed", async () => {
    const secret = makeSecret()
    const flaky = flakySigner(secret, 1)
    const app = new App({user: await User.fromSigner(flaky.signer)})
    const wrap = await makeWrap(getPubkey(secret))

    app.use(Wraps).enqueue(wrap)

    await tick()

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

    await tick()

    expect(app.wrapManager.getRumor(wrap.id)).toBeUndefined()
    expect(flaky.decryptions()).toBe(MAX_UNWRAP_ATTEMPTS)

    wraps.enqueue(wrap)

    await tick()

    expect(flaky.decryptions()).toBe(MAX_UNWRAP_ATTEMPTS)

    app.cleanup()
  })
})
