import {describe, it, expect} from "vitest"
import {get} from "svelte/store"
import {NOTE, WRAP} from "@welshman/util"
import {Nip01Signer, Nip59} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {defaultAppPolicies} from "../src/policy.js"
import {Thunks} from "../src/plugins/thunk.js"
import {Wraps} from "../src/plugins/wraps.js"
import {Network} from "../src/plugins/network.js"

const url = "wss://localhost:1/"

const makeApp = async () => {
  const signer = Nip01Signer.ephemeral()
  const user = await User.fromSigner(signer)

  return {signer, user, app: new App({user, policies: defaultAppPolicies})}
}

const tick = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms))

describe("app teardown", () => {
  it("restores the user's signer on cleanup", async () => {
    const {signer, user, app} = await makeApp()

    expect(user.signer).not.toBe(signer) // wrapped by policies

    app.cleanup()

    expect(user.signer).toBe(signer) // unwrapped again
  })

  it("runs teardowns registered via onCleanup, LIFO", async () => {
    const app = new App()
    const calls: string[] = []

    app.onCleanup(() => calls.push("first"))
    app.onCleanup(() => calls.push("second"))

    app.cleanup()

    expect(calls).toEqual(["second", "first"])
  })

  it("stops pending thunks from publishing after cleanup", async () => {
    const {app} = await makeApp()

    app.use(Thunks).publish({
      event: {kind: NOTE, content: "hi", tags: [], created_at: 0},
      relays: [url],
    })

    app.cleanup()

    await tick()

    // A thunk that kept publishing would pull a fresh socket out of the cleared
    // pool and write its event back into the cleared repository
    expect(app.pool.has(url)).toBe(false)
    expect(app.repository.dump().length).toBe(0)
    expect(get(app.use(Thunks).history)).toEqual([])
  })

  it("stops in-flight loads from opening sockets after cleanup", async () => {
    const {app} = await makeApp()

    app.use(Network).load({filters: [{kinds: [NOTE]}], relays: [url]})

    app.cleanup()

    await tick()

    expect(app.pool.has(url)).toBe(false)
  })

  it("stops queued wraps from unwrapping into the cleared repository", async () => {
    const {user, app} = await makeApp()
    const wrap = await Nip59.fromSigner(Nip01Signer.ephemeral()).wrap(user.pubkey, {
      kind: NOTE,
      content: "secret",
      tags: [],
      created_at: 0,
    })

    expect(wrap.kind).toBe(WRAP)

    app.use(Wraps).enqueue(wrap)

    app.cleanup()

    await tick()

    expect(app.repository.dump().length).toBe(0)
    expect(app.wrapManager.dump().length).toBe(0)
  })
})
