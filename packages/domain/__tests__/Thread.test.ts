import {describe, it, expect} from "vitest"
import {makeSecret, THREAD, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Thread, ThreadBuilder} from "../src/kinds/Thread"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: THREAD,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Thread", () => {
  it("reads title and content", async () => {
    const event = makeEvent({
      content: "thread body",
      tags: [
        ["title", "Hello"],
        ["alt", "x"],
      ],
    })

    const thread = await Thread.fromEvent(event)

    expect(thread.title()).toBe("Hello")
    expect(thread.content()).toBe("thread body")
  })

  it("round-trips with no duplicate title tag", async () => {
    const event = makeEvent({
      content: "thread body",
      tags: [
        ["title", "Hello"],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await Thread.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "title").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["title", "Hello"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("thread body")
  })

  it("round-trips a group (h) behavior tag without rebuilding", async () => {
    const event = makeEvent({
      content: "thread body",
      tags: [
        ["title", "Hello"],
        ["h", "room"],
      ],
    })

    const tmpl = await (await Thread.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", "room"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new ThreadBuilder()
      .setTitle("New thread")
      .setContent("body")
      .group("room")
      .toTemplate(signer)

    expect(tmpl.kind).toBe(THREAD)
    expect(tmpl.tags).toContainEqual(["title", "New thread"])
    expect(tmpl.tags).toContainEqual(["h", "room"])
    expect(tmpl.content).toBe("body")
  })

  it("throws on the wrong kind", async () => {
    await expect(Thread.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
