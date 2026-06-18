import {range, DAY} from "@welshman/lib"
import {EVENT_TIME, getIdentifier, getTagValue} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {DomainObject} from "./base.js"

export type TimeEventValues = {
  identifier: string
  title?: string
  location?: string
  content: string
  start?: number
  end?: number
}

export const makeTimeEventValues = (
  values: Partial<TimeEventValues> = {},
): TimeEventValues => ({
  identifier: "",
  content: "",
  ...values,
})

// NIP-52 kind-31923 time-based calendar event. Addressable via the "d" tag.
// `start`/`end` are unix-second timestamps carried in "start"/"end" tags
// (parsed with parseInt), `title` falls back to the legacy "name" tag, and the
// plain-text body lives in `content`. Room scoping is handled by the base
// `group` behavior tag. Named
// TimeEvent (not CalendarEvent) to leave room for a future date-based event
// (EVENT_DATE 31922); CALENDAR 31924 / EVENT_RSVP 31925 are not used. Tags +
// plain content, so it extends DomainObject directly.
//
// The "D" day tags are NOT intrinsic state — they're a derived index over
// start..end used purely so calendar events can be filtered by day, so they're
// dropped on parse and recomputed in toTemplate (matching flotilla's
// daysBetween: one tag per epoch-day floor(seconds / DAY) the event spans).
export class TimeEvent extends DomainObject<TimeEventValues> {
  readonly kind = EVENT_TIME
  values = makeTimeEventValues()

  protected normalizeValues(values: Partial<TimeEventValues> = {}) {
    return makeTimeEventValues(values)
  }

  protected parseEvent(event: TrustedEvent): Partial<TimeEventValues> {
    const start = parseInt(getTagValue("start", event.tags)!)
    const end = parseInt(getTagValue("end", event.tags)!)

    return {
      identifier: getIdentifier(event) || "",
      title: getTagValue("title", event.tags) || getTagValue("name", event.tags),
      location: getTagValue("location", event.tags),
      content: event.content || "",
      start: isNaN(start) ? undefined : start,
      end: isNaN(end) ? undefined : end,
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

  async toTemplate(): Promise<EventTemplate> {
    const {identifier, title, location, content, start, end} = this.values

    const tags: string[][] = [["d", identifier]]

    if (title) tags.push(["title", title])
    if (location) tags.push(["location", location])
    if (start != null) tags.push(["start", String(start)])
    if (end != null) tags.push(["end", String(end)])

    // Derived day index for filtering: one "D" tag per epoch-day the event spans.
    if (start != null && end != null) {
      for (const t of range(start, end, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return {kind: this.kind, content, tags}
  }
}
