import {describe, it, expect} from "vitest"
import {makeSecret, EVENT_DATE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {DateEvent} from "../src/kinds/DateEvent"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

// 2023-11-14 and 2023-11-17 as epoch-day indexes, the same units the derived "D"
// tags are counted in.
const startDay = Date.parse("2023-11-14") / 86400000
const endDay = Date.parse("2023-11-17") / 86400000

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: EVENT_DATE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("DateEvent", () => {
  it("reads represented tags and content", async () => {
    const date = await read(
      DateEvent,
      makeEvent({
        content: "three days off",
        tags: [
          ["d", "abc"],
          ["title", "Holiday"],
          ["location", "Lisbon"],
          ["start", "2023-11-14"],
          ["end", "2023-11-17"],
          ["alt", "x"],
        ],
      }),
    )

    expect(date.identifier()).toBe("abc")
    expect(date.title()).toBe("Holiday")
    expect(date.location()).toBe("Lisbon")
    expect(date.start()).toBe("2023-11-14")
    expect(date.end()).toBe("2023-11-17")
    expect(date.content()).toBe("three days off")
  })

  it("derives one D tag per day covered, excluding the end date", async () => {
    const tmpl = await buildTemplate(
      write(DateEvent).setIdentifier("abc").setStart("2023-11-14").setEnd("2023-11-17"),
      signer,
    )

    expect(tmpl.kind).toBe(EVENT_DATE)
    expect(tmpl.tags.filter(t => t[0] === "D")).toEqual([
      ["D", String(startDay)],
      ["D", String(startDay + 1)],
      ["D", String(startDay + 2)],
    ])
    expect(String(endDay)).toBe(String(startDay + 3))
  })

  it("covers the start day alone when there is no end", async () => {
    const tmpl = await buildTemplate(
      write(DateEvent).setIdentifier("abc").setStart("2023-11-14"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "D")).toEqual([["D", String(startDay)]])
  })

  it("derives no D tags from an unparseable start", async () => {
    const tmpl = await buildTemplate(
      write(DateEvent).setIdentifier("abc").setStart("sometime next week"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "D")).toEqual([])
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "three days off",
      tags: [
        ["d", "abc"],
        ["title", "Holiday"],
        ["location", "Lisbon"],
        ["start", "2023-11-14"],
        ["end", "2023-11-17"],
        ["D", "999999"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(write(DateEvent, await read(DateEvent, event)), signer)

    for (const key of ["d", "title", "location", "start", "end"]) {
      expect(tmpl.tags.filter(t => t[0] === key).length).toBe(1)
    }
    // The stale index is consumed on read and recomputed from the dates.
    expect(tmpl.tags.filter(t => t[0] === "D").length).toBe(3)
    expect(tmpl.tags).not.toContainEqual(["D", "999999"])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("three days off")
  })

  it("requires a d tag", async () => {
    await expect(buildTemplate(write(DateEvent).setStart("2023-11-14"), signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(DateEvent, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
