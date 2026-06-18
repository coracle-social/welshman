import {EVENT_TIME, getIdentifier, getTagValue, getTagValues, getAddress} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type CalendarEventValues = {
  identifier: string
  title?: string
  location?: string
  content: string
  start?: number
  end?: number
  days: string[]
  h?: string
}

export const makeCalendarEventValues = (
  values: Partial<CalendarEventValues> = {},
): CalendarEventValues => ({
  identifier: "",
  content: "",
  days: [],
  ...values,
})

// NIP-52 kind-31923 time-based calendar event. Addressable via the "d" tag.
// `start`/`end` are unix-second timestamps carried in "start"/"end" tags
// (parsed with parseInt), `title` falls back to the legacy "name" tag, and the
// plain-text body lives in `content`. Flotilla additionally writes per-day
// ["D", "YYYY-MM-DD"] tags spanning start..end for day-bucket querying, and an
// optional "h" tag scoping the event to a room (commented via "#A"). This is the
// only calendar object flotilla uses (CALENDAR 31924 / EVENT_DATE 31922 /
// EVENT_RSVP 31925 are not used). Tags + plain content, so it extends
// DomainObject directly.
export class CalendarEvent extends DomainObject<CalendarEventValues> {
  readonly kind = EVENT_TIME
  values = makeCalendarEventValues()

  protected normalizeValues(values: Partial<CalendarEventValues> = {}) {
    return makeCalendarEventValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<CalendarEventValues> {
    const start = parseInt(getTagValue("start", event.tags)!)
    const end = parseInt(getTagValue("end", event.tags)!)

    return {
      identifier: getIdentifier(event) || "",
      title: getTagValue("title", event.tags) || getTagValue("name", event.tags),
      location: getTagValue("location", event.tags),
      content: event.content || "",
      start: isNaN(start) ? undefined : start,
      end: isNaN(end) ? undefined : end,
      days: getTagValues("D", event.tags),
      h: getTagValue("h", event.tags),
    }
  }

  identifier() {
    return this.values.identifier
  }

  title() {
    return this.values.title
  }

  location() {
    return this.values.location
  }

  content() {
    return this.values.content
  }

  start() {
    return this.values.start
  }

  end() {
    return this.values.end
  }

  days() {
    return this.values.days
  }

  h() {
    return this.values.h
  }

  room() {
    return this.values.h
  }

  address() {
    return getAddress(this.event!)
  }

  async toTemplate(): Promise<EventTemplate> {
    const {identifier, title, location, content, start, end, days, h} = this.values

    const tags: string[][] = [["d", identifier]]

    if (title) tags.push(["title", title])
    if (location) tags.push(["location", location])
    if (start != null) tags.push(["start", String(start)])
    if (end != null) tags.push(["end", String(end)])

    for (const day of days) {
      tags.push(["D", day])
    }

    if (h) tags.push(["h", h])

    return {kind: this.kind, content, tags}
  }
}
