import {get} from "svelte/store"
import {describe, it, expect, beforeEach, afterEach, vi} from "vitest"
import {batch, noop, on, sleep} from "@welshman/lib"
import {NOTE, isSignedEvent, prep} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"
import {AdapterEvent, MockAdapter, mergeRepositoryUpdates, PublishStatus} from "@welshman/net"
import type {ClientMessage, RepositoryUpdate} from "@welshman/net"
import {Nip01Signer} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {Publication, PublicationGroup, Publisher} from "../src/plugins/publisher.js"
import type {Publishable} from "../src/plugins/publisher.js"

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

// Long enough for the queue to hand the publication on and for signing to finish.
const tick = () => new Promise(resolve => setTimeout(resolve, 500))

describe("publisher retries", () => {
  // Only Date, so the queue's own timers still run.
  beforeEach(() => vi.useFakeTimers({toFake: ["Date"]}))
  afterEach(() => vi.useRealTimers())

  it("re-sends the event it published rather than stamping a new one", async () => {
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const publication = publisher.publish({event: note("hi"), relays: [url]})

    await tick()

    expect(isSignedEvent(publication.event)).toBe(true)

    // A minute later, so a retry that re-stamps the event would change its id.
    vi.setSystemTime(Date.now() + 60_000)

    const retried = publisher.retry(publication)

    expect(retried.event.id).toBe(publication.event.id)
    expect(isSignedEvent(retried.event)).toBe(true)
    expect(app.repository.dump().length).toBe(1)

    app.cleanup()
  })

  it("keeps its event in step, so a rebuild from its request re-sends the same event", async () => {
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const publication = publisher.publish({event: note("hi"), relays: [url]})

    await tick()

    vi.setSystemTime(Date.now() + 60_000)

    const rebuilt = publisher.publish({
      ...publication.request,
      event: publication.event,
      relays: [url],
    })

    expect(rebuilt.event.id).toBe(publication.event.id)
    expect(isSignedEvent(rebuilt.event)).toBe(true)
    expect(app.repository.dump().length).toBe(1)

    app.cleanup()
  })

  it("re-sends every part of a merged group", async () => {
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const merged = publisher.merge(
      ["one", "two"].map(content => publisher.publish({event: note(content), relays: [url]})),
    )

    await tick()

    const ids = merged.publications.map(publication => publication.event.id)

    vi.setSystemTime(Date.now() + 60_000)

    const retried = publisher.retry(merged).publications

    expect(retried.map(publication => publication.event.id)).toEqual(ids)

    app.cleanup()
  })

  it("retries whichever it is given when the caller only knows it is publishable", async () => {
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const target: Publishable = publisher.publish({event: note("hi"), relays: [url]})

    await tick()

    const retried = publisher.retry(target)

    expect(retried).toBeInstanceOf(Publication)

    app.cleanup()
  })

  it("re-sends only to the given relays", async () => {
    const other = "wss://localhost:2/"
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const publication = publisher.publish({event: note("hi"), relays: [url, other]})

    await tick()

    const retried = publisher.retry(publication, [other])

    expect(retried.relays).toEqual([other])
    expect(retried.event.id).toBe(publication.event.id)

    app.cleanup()
  })

  it("re-sends only the parts of a merged group that published to the given relays", async () => {
    const other = "wss://localhost:2/"
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const one = publisher.publish({event: note("one"), relays: [url]})
    const two = publisher.publish({event: note("two"), relays: [url, other]})

    await tick()

    const retried = publisher.retry(publisher.merge([one, two]), [other]).publications

    expect(retried.map(publication => publication.event.id)).toEqual([two.event.id])
    expect(retried.map(publication => publication.relays)).toEqual([[other]])

    app.cleanup()
  })

  it("leaves an attempt it replaced mid-flight for cleanup to stop", async () => {
    const app = await makeApp(slowSigner(2000))
    const publisher = app.use(Publisher)
    const publication = publisher.publish({event: note("hi"), relays: [url]})
    const retried = publisher.retry(publication)

    app.cleanup()

    expect(publication.state.stage).toBe("aborted")
    expect(retried.state.stage).toBe("aborted")
  })

  it("drops the attempts it replaces from history, so a view of the event sees only the retry", async () => {
    const app = await makeApp()
    const publisher = app.use(Publisher)
    const one = publisher.publish({event: note("one"), relays: [url]})
    const two = publisher.publish({event: note("two"), relays: [url]})

    await tick()

    const retried = publisher.retry(one)

    expect(get(publisher.history)).toEqual([two, retried])

    app.cleanup()
  })
})

// makePow needs a Worker, which happy-dom lacks; this one re-hashes without mining.
const stubPowWorker = () => {
  const original = Reflect.get(globalThis, "Worker")

  Reflect.set(
    globalThis,
    "Worker",
    class {
      onmessage: ((e: {data: unknown}) => void) | null = null
      onerror: ((e: unknown) => void) | null = null

      postMessage({event}: {event: {tags: string[][]}}) {
        const mined = {...event, tags: [...event.tags, ["nonce", "1", "4"]], id: "b".repeat(64)}

        setTimeout(() => this.onmessage?.({data: mined}), 0)
      }

      terminate() {}
    },
  )

  return () => Reflect.set(globalThis, "Worker", original)
}

describe("publisher optimistic publishes", () => {
  it("never reports the optimistic event as removed once it is signed", async () => {
    const app = await makeApp()
    const removed: string[] = []

    on(app.repository, "update", (update: RepositoryUpdate) => {
      for (const id of update.removed) removed.push(id)
    })

    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url]})

    await tick()

    expect(removed).toEqual([])
    expect(isSignedEvent(app.repository.getEvent(publication.event.id)!)).toBe(true)

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

    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url]})

    await tick()

    expect(snapshots.length).toBeGreaterThan(0)

    for (const snapshot of snapshots) {
      expect(Array.from(snapshot)).toEqual([publication.event.id])
    }

    app.cleanup()
  })

  it("unwinds the copy it wrote when pow re-hashed the event before an abort", async () => {
    const restoreWorker = stubPowWorker()
    const app = await makeApp(slowSigner(2000))
    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url], pow: 4})

    expect(app.repository.dump().length).toBe(1)

    // Past the queue's handoff and pow's re-hash, but short of the signer returning.
    await sleep(400)

    publication.abort()

    expect(app.repository.dump()).toEqual([])

    app.cleanup()
    restoreWorker()
  })
})

const countingSigner = () => {
  const signer = Nip01Signer.ephemeral()
  const calls = {sign: 0}

  return {
    calls,
    signer: {
      ...signer,
      sign: async (...args: Parameters<ISigner["sign"]>) => {
        calls.sign++

        return signer.sign(...args)
      },
    } as ISigner,
  }
}

describe("publisher stages", () => {
  it("settles as failed on every relay when signing throws", async () => {
    const signer = Nip01Signer.ephemeral()
    const app = await makeApp({
      ...signer,
      sign: async () => {
        throw new Error("rejected")
      },
    })
    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url]})

    await publication.settled()

    expect(publication.state.stage).toBe("failed")
    expect(publication.getFailedUrls()).toEqual([url])
    expect(publication.getError()).toBe("Error: rejected")

    app.cleanup()
  })

  it("asks the signer for nothing when aborted during the delay", async () => {
    const {signer, calls} = countingSigner()
    const app = await makeApp(signer)
    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url], delay: 300})

    await sleep(200)

    expect(publication.state.stage).toBe("delayed")

    publication.abort()

    await sleep(300)

    expect(publication.state.stage).toBe("aborted")
    expect(calls.sign).toBe(0)
    expect(app.repository.dump()).toEqual([])

    app.cleanup()
  })

  it("can be aborted until it reaches a relay", async () => {
    const app = await makeApp()
    const publication = app.use(Publisher).publish({
      event: note("hi"),
      relays: [url],
      delay: 100,
      timeout: 50,
    })

    expect(publication.canAbort()).toBe(true)

    await publication.settled()

    expect(publication.canAbort()).toBe(false)

    app.cleanup()
  })

  it("keeps no subscribers once it has settled", async () => {
    const app = await makeApp()
    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url], timeout: 50})

    await publication.settled()

    const subscriber = vi.fn()

    publication.subscribe(subscriber)
    new PublicationGroup([publication]).subscribe(subscriber)

    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(Reflect.get(publication, "_subs")).toEqual([])

    app.cleanup()
  })

  it("ignores an abort once it has settled", async () => {
    const app = await makeApp()
    const publication = app.use(Publisher).publish({event: note("hi"), relays: [url], timeout: 50})

    await publication.settled()

    expect(publication.state.stage).toBe("sent")

    publication.abort()

    expect(publication.state.stage).toBe("sent")
    expect(app.repository.getEvent(publication.event.id)).toBeDefined()

    app.cleanup()
  })
})

describe("publication groups", () => {
  const other = "wss://localhost:2/"
  const event = {id: "a".repeat(64), pubkey: "b".repeat(64), created_at: 0, ...note("hi")}
  const result = (relay: string, status: PublishStatus) => ({relay, status, detail: ""})

  it("reports a relay as a success only once every publication to it succeeded", () => {
    const one = new Publication({event, relays: [url, other]}, event)
    const two = new Publication({event, relays: [url]}, event)
    const group = new PublicationGroup([one, two])

    one.advance({
      stage: "sent",
      results: {
        [url]: result(url, PublishStatus.Success),
        [other]: result(other, PublishStatus.Success),
      },
    })

    // `two` hasn't reached `url` yet, so the group can't say how it went there
    expect(group.getIncompleteUrls()).toEqual([url])
    expect(group.getCompleteUrls()).toEqual([other])

    two.advance({stage: "sent", results: {[url]: result(url, PublishStatus.Failure)}})

    expect(group.isComplete()).toBe(true)
    expect(group.getFailedUrls()).toEqual([url])
  })
})

describe("gift wraps of one rumor to several recipients", () => {
  let alice: string
  let bob: string

  beforeEach(async () => {
    alice = await Nip01Signer.ephemeral().getPubkey()
    bob = await Nip01Signer.ephemeral().getPubkey()
  })

  // A relay that accepts every wrap except the ones addressed to `rejected`.
  const makeRelayApp = async (rejected: string) => {
    const user = await User.fromSigner(Nip01Signer.ephemeral())

    return new App({
      user,
      getAdapter: (relay: string) => {
        const adapter: MockAdapter = new MockAdapter(relay, (message: ClientMessage) => {
          if (message[0] === "EVENT") {
            const wrap = message[1] as SignedEvent
            const accepted = !wrap.tags.some(t => t[0] === "p" && t[1] === rejected)

            adapter.receive(["OK", wrap.id, accepted, accepted ? "" : "blocked"])
          }
        })

        adapter.on(AdapterEvent.Receive, noop)

        return adapter
      },
    })
  }

  const publishToBoth = (app: App) => {
    const rumor = prep(note("hi"), User.require(app).pubkey)
    const publisher = app.use(Publisher)

    return [alice, bob].map(recipient =>
      publisher.publish({event: rumor, relays: [url], recipient}),
    )
  }

  it("keeps the rumor on a relay that took one of its wraps but refused another", async () => {
    const app = await makeRelayApp(bob)
    const [toAlice, toBob] = publishToBoth(app)

    await new PublicationGroup([toAlice, toBob]).settled()

    expect(toAlice.getUrlsWithStatus(PublishStatus.Success)).toEqual([url])
    expect(toBob.getFailedUrls()).toEqual([url])
    expect(app.tracker.hasRelay(toAlice.event.id, url)).toBe(true)

    app.cleanup()
  })

  it("keeps the rumor when one recipient's wrap is aborted and the other is still sending", async () => {
    const app = await makeRelayApp("")
    const [toAlice, toBob] = publishToBoth(app)

    toBob.abort()

    expect(app.repository.getEvent(toAlice.event.id)).toBeDefined()

    await toAlice.settled()

    expect(app.repository.getEvent(toAlice.event.id)).toBeDefined()

    app.cleanup()
  })
})
