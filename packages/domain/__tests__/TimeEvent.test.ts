import {describe, it, expect} from "vitest"
import {makeSecret, EVENT_TIME, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {TimeEvent, TimeEventBuilder} from "../src/kinds/TimeEvent"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

// Both timestamps fall within the same epoch-day so exactly one derived "D" tag
// is produced (range yields only `start` when end < start + DAY).
const start = 1700000000
const end = 1700003600

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: EVENT_TIME,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("TimeEvent", () => {
  it("reads represented tags and content", async () => {
    const event = makeEvent({
      content: "meetup",
      tags: [
        ["d", "abc"],
        ["title", "Party"],
        ["location", "Town Hall"],
        ["start", String(start)],
        ["end", String(end)],
        ["alt", "x"],
      ],
    })

    const time = await TimeEvent.fromEvent(event)

    expect(time.identifier()).toBe("abc")
    expect(time.title()).toBe("Party")
    expect(time.location()).toBe("Town Hall")
    expect(time.start()).toBe(start)
    expect(time.end()).toBe(end)
    expect(time.content()).toBe("meetup")
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "meetup",
      tags: [
        ["d", "abc"],
        ["title", "Party"],
        ["location", "Town Hall"],
        ["start", String(start)],
        ["end", String(end)],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await TimeEvent.fromEvent(event)).builder().toTemplate(signer)

    for (const key of ["d", "title", "location", "start", "end"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    expect(tmpl.tags).toContainEqual(["d", "abc"])
    expect(tmpl.tags).toContainEqual(["title", "Party"])
    expect(tmpl.tags).toContainEqual(["start", String(start)])
    // Derived day index recomputed exactly once for this single-day span.
    expect(tmpl.tags.filter(t => t[0] === "D").length).toBe(1)
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("meetup")
  })

  it("does not duplicate the D index on round-trip", async () => {
    // Even though the source already carries a "D" tag, it is consumed on read
    // and recomputed, so it must appear exactly once.
    const event = makeEvent({
      tags: [
        ["d", "abc"],
        ["start", String(start)],
        ["end", String(end)],
        ["D", "999999"],
      ],
    })

    const tmpl = await (await TimeEvent.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "D").length).toBe(1)
    expect(tmpl.tags).not.toContainEqual(["D", "999999"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new TimeEventBuilder()
      .setIdentifier("event1")
      .setTitle("Fresh")
      .setStart(start)
      .setEnd(end)
      .toTemplate(signer)

    expect(tmpl.kind).toBe(EVENT_TIME)
    expect(tmpl.tags).toContainEqual(["d", "event1"])
    expect(tmpl.tags).toContainEqual(["title", "Fresh"])
    expect(tmpl.tags).toContainEqual(["start", String(start)])
  })

  it("throws on the wrong kind", async () => {
    await expect(TimeEvent.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
