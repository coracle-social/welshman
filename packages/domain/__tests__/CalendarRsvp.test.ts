import {describe, it, expect} from "vitest"
import {makeSecret, EVENT_RSVP, EVENT_TIME, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {CalendarRsvp} from "../src/kinds/CalendarRsvp"
import {buildTemplate, markerResolver, query, queryRelays, read, write, INBOX} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const organizer = "aa".repeat(32)
const address = `${EVENT_TIME}:${organizer}:nostrica`

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: EVENT_RSVP,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const calendarEvent = {
  id: "11".repeat(32),
  pubkey: organizer,
  created_at: 0,
  kind: EVENT_TIME,
  tags: [["d", "nostrica"]],
  content: "",
  sig: "00".repeat(64),
} as TrustedEvent

describe("CalendarRsvp", () => {
  it("reads represented tags", async () => {
    const rsvp = await read(
      CalendarRsvp,
      makeEvent({
        content: "see you there",
        tags: [
          ["d", "abc"],
          ["a", address],
          ["e", "11".repeat(32)],
          ["status", "accepted"],
          ["fb", "busy"],
        ],
      }),
    )

    expect(rsvp.identifier()).toBe("abc")
    expect(rsvp.calendarEvent()).toBe(address)
    expect(rsvp.calendarEventId()).toBe("11".repeat(32))
    expect(rsvp.status()).toBe("accepted")
    expect(rsvp.freebusy()).toBe("busy")
    expect(rsvp.content()).toBe("see you there")
  })

  it("builds from the calendar event, crediting its organizer", async () => {
    const tmpl = await buildTemplate(
      write(CalendarRsvp)
        .setIdentifier("abc")
        .setCalendarEventFromEvent(calendarEvent)
        .setStatus("accepted")
        .setFreebusy("busy"),
      signer,
    )

    expect(tmpl.kind).toBe(EVENT_RSVP)
    expect(tmpl.tags).toContainEqual(["a", address])
    expect(tmpl.tags).toContainEqual(["e", calendarEvent.id, ""])
    expect(tmpl.tags).toContainEqual(["p", organizer, ""])
    expect(tmpl.tags).toContainEqual(["status", "accepted"])
    expect(tmpl.tags).toContainEqual(["fb", "busy"])
  })

  it("answers one calendar event at a time", async () => {
    const tmpl = await buildTemplate(
      write(CalendarRsvp)
        .setIdentifier("abc")
        .setCalendarEvent(`${EVENT_TIME}:${organizer}:other`)
        .setCalendarEvent(address)
        .setStatus("tentative"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([["a", address]])
  })

  it("drops free/busy when the rsvp is declined", async () => {
    const tmpl = await buildTemplate(
      write(CalendarRsvp)
        .setIdentifier("abc")
        .setCalendarEvent(address)
        .setFreebusy("free")
        .setStatus("declined"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "fb")).toEqual([])
  })

  it("refuses free/busy set after declining", async () => {
    await expect(
      buildTemplate(
        write(CalendarRsvp)
          .setIdentifier("abc")
          .setCalendarEvent(address)
          .setStatus("declined")
          .setFreebusy("free"),
        signer,
      ),
    ).rejects.toThrow()
  })

  it("requires a calendar event and a status", async () => {
    await expect(
      buildTemplate(write(CalendarRsvp).setIdentifier("abc").setStatus("accepted"), signer),
    ).rejects.toThrow()
    await expect(
      buildTemplate(write(CalendarRsvp).setIdentifier("abc").setCalendarEvent(address), signer),
    ).rejects.toThrow()
  })

  it("asks the organizer's inbox for an event's rsvps", async () => {
    const rsvps = query(CalendarRsvp, markerResolver).forCalendarEvent(address)

    expect(await rsvps.renderFilters()).toEqual([{kinds: [EVENT_RSVP], "#a": [address]}])
    expect(await queryRelays(rsvps)).toEqual([INBOX])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(CalendarRsvp, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
