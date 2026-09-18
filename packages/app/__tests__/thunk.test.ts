import {describe, it, expect, beforeEach, afterEach, vi} from "vitest"
import {batch, on, sleep} from "@welshman/lib"
import {NOTE, isSignedEvent} from "@welshman/util"
import {mergeRepositoryUpdates} from "@welshman/net"
import type {RepositoryUpdate} from "@welshman/net"
import {Nip01Signer} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Thunk, Thunks} from "../src/plugins/thunk.js"

const url = "wss://localhost:1/"

const makeApp = async (signer: ISigner = Nip01Signer.ephemeral()) =>
  new App({user: await User.fromSigner(signer)})

const slowSigner = (ms: number): ISigner => {
  const signer = Nip01Signer.ephemeral()

  return {
    ...signer,
    sign: async (event, options) => sleep(ms).then(() => signer.sign(event, options)),
  }
}

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

describe("thunk optimistic publishes", () => {
  it("never reports the optimistic event as removed once it is signed", async () => {
    const app = await makeApp()
    const removed: string[] = []

    on(app.repository, "update", (update: RepositoryUpdate) => {
      for (const id of update.removed) removed.push(id)
    })

    const thunk = app.use(Thunks).publish({event: note("hi"), relays: [url]})

    await tick()

    expect(removed).toEqual([])
    expect(isSignedEvent(app.repository.getEvent(thunk.options.event.id)!)).toBe(true)

    app.cleanup()
  })

  it("stays visible to a listener that batches repository updates", async () => {
    const app = await makeApp(slowSigner(300))
    const live = new Set<string>()
    const snapshots: Set<string>[] = []

    on(
      app.repository,
      "update",
      batch(150, (updates: RepositoryUpdate[]) => {
        const {added, removed} = mergeRepositoryUpdates(updates)

        for (const event of added) live.add(event.id)
        for (const id of removed) live.delete(id)

        snapshots.push(new Set(live))
      }),
    )

    const thunk = app.use(Thunks).publish({event: note("hi"), relays: [url]})

    await tick()

    expect(snapshots.length).toBeGreaterThan(0)

    for (const snapshot of snapshots) {
      expect(Array.from(snapshot)).toEqual([thunk.options.event.id])
    }

    app.cleanup()
  })
})
