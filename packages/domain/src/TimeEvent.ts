import {randomId, range, DAY} from "@welshman/lib"
import {EVENT_TIME, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-52 kind-31923 time-based calendar event. Addressable via the "d" tag.
// `start`/`end` are unix-second timestamps carried in "start"/"end" tags
// (parsed with parseInt), `title` falls back to the legacy "name" tag, and the
// plain-text body lives in the event content. Room scoping is handled by the
// base `group` behavior tag. Named TimeEvent (not CalendarEvent) to leave room
// for a future date-based event (EVENT_DATE 31922); CALENDAR 31924 /
// EVENT_RSVP 31925 are not used. Tags + plain-text content, so it extends
// EventReader/EventBuilder directly (no parsed `plain`).
//
// The "D" day tags are NOT intrinsic state — they're a derived index over
// start..end used purely so calendar events can be filtered by day, so they're
// dropped on read and recomputed in buildTags (matching flotilla's
// daysBetween: one tag per epoch-day floor(seconds / DAY) the event spans).
export class TimeEvent extends EventReader {
  static kind = EVENT_TIME

  protected reservedTagKeys() {
    return ["d", "title", "name", "location", "start", "end", "D"]
  }

  title() {
    return getTagValue("title", this.event.tags) || getTagValue("name", this.event.tags)
  }

  location() {
    return getTagValue("location", this.event.tags)
  }

  content() {
    return this.event.content || ""
  }

  start() {
    const start = parseInt(getTagValue("start", this.event.tags)!)

    return isNaN(start) ? undefined : start
  }

  end() {
    const end = parseInt(getTagValue("end", this.event.tags)!)

    return isNaN(end) ? undefined : end
  }

  builder() {
    const builder = new TimeEventBuilder()

    builder.identifier = this.identifier() || ""
    builder.title = this.title()
    builder.location = this.location()
    builder.content = this.content()
    builder.start = this.start()
    builder.end = this.end()

    return this.seedBuilder(builder)
  }
}

export class TimeEventBuilder extends EventBuilder {
  static kind = EVENT_TIME

  identifier = randomId()
  title?: string
  location?: string
  content = ""
  start?: number
  end?: number

  setTitle(title: string) {
    this.title = title

    return this
  }

  setLocation(location: string) {
    this.location = location

    return this
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  setStart(start: number) {
    this.start = start

    return this
  }

  setEnd(end: number) {
    this.end = end

    return this
  }

  protected buildContent() {
    return this.content
  }

  protected buildTags() {
    const tags: string[][] = [["d", this.identifier]]

    if (this.title) tags.push(["title", this.title])
    if (this.location) tags.push(["location", this.location])
    if (this.start != null) tags.push(["start", String(this.start)])
    if (this.end != null) tags.push(["end", String(this.end)])

    // Derived day index for filtering: one "D" tag per epoch-day the event spans.
    if (this.start != null && this.end != null) {
      for (const t of range(this.start, this.end, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return tags
  }
}
