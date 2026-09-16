import {describe, it, expect, beforeEach, afterEach, vi} from "vitest"
import {NOTE, isSignedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Thunk, Thunks} from "../src/plugins/thunk.js"

const url = "wss://localhost:1/"

const makeApp = async () => new App({user: await User.fromSigner(Nip01Signer.ephemeral())})

const note = (content: string) => ({kind: NOTE, content, tags: []})

// Long enough for the queue to hand the thunk on and for signing to finish.
const tick = () => new Promise(resolve => setTimeout(resolve, 500))

describe("thunk retries", () => {
  // Only Date, so the queue's own timers still run.
  beforeEach(() => vi.useFakeTimers({toFake: ["Date"]}))
  afterEach(() => vi.useRealTimers())

  it("re-sends the event the thunk published rather than stamping a new one", async () => {
    const app = await makeApp()
    const thunks = app.use(Thunks)
    const thunk = thunks.publish({event: note("hi"), relays: [url]})

    await tick()

    expect(isSignedEvent(thunk.options.event)).toBe(true)

    // A minute later, which is the whole difference between a retry that duplicates and one
    // that doesn't.
    vi.setSystemTime(Date.now() + 60_000)

    const retried = thunks.retry(thunk) as Thunk

    expect(retried.options.event.id).toBe(thunk.options.event.id)
    expect(isSignedEvent(retried.options.event)).toBe(true)
    expect(app.repository.dump().length).toBe(1)

    app.cleanup()
  })

  it("keeps its options in step, so a rebuild from them alone re-sends the same event", async () => {
    const app = await makeApp()
    const thunks = app.use(Thunks)
    const thunk = thunks.publish({event: note("hi"), relays: [url]})

    await tick()

    vi.setSystemTime(Date.now() + 60_000)

    const rebuilt = thunks.publish({...thunk.options, relays: [url]})

    expect(rebuilt.options.event.id).toBe(thunk.options.event.id)
    expect(isSignedEvent(rebuilt.options.event)).toBe(true)
    expect(app.repository.dump().length).toBe(1)

    app.cleanup()
  })

  it("re-sends every part of a merged thunk", async () => {
    const app = await makeApp()
    const thunks = app.use(Thunks)
    const merged = thunks.merge(
      ["one", "two"].map(content => thunks.publish({event: note(content), relays: [url]})),
    )

    await tick()

    const ids = Array.from(thunks.flatten([merged])).map(thunk => thunk.options.event.id)

    vi.setSystemTime(Date.now() + 60_000)

    const retried = Array.from(thunks.flatten([thunks.retry(merged)]))

    expect(retried.map(thunk => thunk.options.event.id)).toEqual(ids)

    app.cleanup()
  })
})
