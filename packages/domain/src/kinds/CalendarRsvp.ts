import {spec} from "@welshman/lib"
import {
  Address,
  EVENT_RSVP,
  addressTags,
  getAddress,
  hexTags,
  inbox,
  outbox,
  tagSpec,
  tagValue,
} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

export type RsvpStatus = "accepted" | "declined" | "tentative"

export type RsvpFreebusy = "free" | "busy"

// NIP-52 kind-31925 rsvp to a calendar event. It names the event by address, since
// a `DateEvent` or `TimeEvent` may be edited after the rsvp is written.
export class CalendarRsvpReader extends EventReader {
  calendarEvent() {
    return tagValue(addressTags("a"), this.event.tags)
  }

  // The exact revision of the calendar event replied to, when the author pinned one.
  calendarEventId() {
    return tagValue(hexTags("e"), this.event.tags)
  }

  status() {
    return tagValue(tagSpec("status"), this.event.tags) as RsvpStatus | undefined
  }

  // Whether the author is otherwise free, which is separate from whether they
  // are coming. Absent on a declined rsvp.
  freebusy() {
    return tagValue(tagSpec("fb"), this.event.tags) as RsvpFreebusy | undefined
  }
}

export class CalendarRsvpWriter extends EventWriter<CalendarRsvpReader> {
  // An rsvp answers exactly one calendar event, so replace any existing one.
  setCalendarEvent(address: string) {
    return this.dropTags(spec(["a"])).addTags(["a", address])
  }

  // Pins the rsvp to this revision of the event and credits its organizer, so the
  // rsvp reaches their inbox.
  setCalendarEventFromEvent(event: TrustedEvent) {
    this.setCalendarEvent(getAddress(event))
    this.addMention(event.pubkey)

    const tag = ["e", event.id, ""]

    this.dropTags(spec(["e"])).addTags(tag)

    this.hint(outbox(event.pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  setStatus(status: RsvpStatus) {
    this.dropTags(spec(["status"])).addTags(["status", status])

    // NIP-52 has no free/busy on a declined rsvp — there is nothing to block out.
    if (status === "declined") {
      this.clearFreebusy()
    }

    return this
  }

  setFreebusy(freebusy: RsvpFreebusy) {
    return this.dropTags(spec(["fb"])).addTags(["fb", freebusy])
  }

  clearFreebusy() {
    return this.dropTags(spec(["fb"]))
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["a"]))) {
      throw new Error("An rsvp must name a calendar event via an a tag")
    }

    if (!this.extraTags.some(spec(["status"]))) {
      throw new Error("An rsvp must have a status")
    }

    if (this.extraTags.some(spec(["status", "declined"])) && this.extraTags.some(spec(["fb"]))) {
      throw new Error("A declined rsvp must not say whether its author is free")
    }
  }
}

export class CalendarRsvpQuery extends EventQuery {
  // Every rsvp to a calendar event, whoever wrote it.
  forCalendarEvent(address: string) {
    return this.addTag("a", [address])
  }

  protected renderRoutes() {
    const organizers = (this.tagValues.get("a") ?? [])
      .filter(address => Address.isAddress(address))
      .map(address => Address.from(address).pubkey)

    return [
      ...this.authorRoutes(),
      ...this.mentionRoutes(),
      ...organizers.map(pubkey => inbox(pubkey, 0.5)),
    ]
  }
}

export const CalendarRsvp = new KindFactory({
  kind: EVENT_RSVP,
  reader: CalendarRsvpReader,
  writer: CalendarRsvpWriter,
  query: CalendarRsvpQuery,
})
