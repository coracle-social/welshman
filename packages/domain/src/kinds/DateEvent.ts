import {range, DAY, spec} from "@welshman/lib"
import {EVENT_DATE, tagSpec, tagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// A date-based event spans whole days in no particular timezone, so its bounds are
// `YYYY-MM-DD` strings rather than timestamps. Parsing one gives the UTC midnight
// it starts at, which is what the day buckets are counted from.
const parseDate = (date = "") => {
  const ts = Date.parse(date)

  return isNaN(ts) ? undefined : ts / 1000
}

// NIP-52 kind-31922 date-based calendar event — an all-day event, as against
// `TimeEvent`'s kind 31923, which starts and ends at an instant.
export class DateEventReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  location() {
    return tagValue(tagSpec("location"), this.event.tags)
  }

  start() {
    return tagValue(tagSpec("start"), this.event.tags)
  }

  // The day after the last one the event covers, per NIP-52. Absent on a one-day event.
  end() {
    return tagValue(tagSpec("end"), this.event.tags)
  }
}

export class DateEventWriter extends EventWriter<DateEventReader> {
  constructor(kind: number, context: KindContext, reader?: DateEventReader) {
    super(kind, context, reader)

    const parser = new TagParser(this.extraTags)

    parser.consume("D")
    this.extraTags = parser.tags
  }

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setLocation(location: string) {
    return this.dropTags(spec(["location"])).addTags(["location", location])
  }

  setStart(start: string) {
    return this.dropTags(spec(["start"])).addTags(["start", start])
  }

  setEnd(end: string) {
    return this.dropTags(spec(["end"])).addTags(["end", end])
  }

  protected renderDomainTags() {
    const tags: string[][] = []
    const start = parseDate(this.extraTags.find(spec(["start"]))?.[1] as string)
    const end = parseDate(this.extraTags.find(spec(["end"]))?.[1] as string)

    // An event with no end covers its start day alone.
    if (start !== undefined) {
      for (const t of range(start, end ?? start + DAY, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return tags
  }
}

export class DateEventQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const DateEvent = new KindFactory({
  kind: EVENT_DATE,
  reader: DateEventReader,
  writer: DateEventWriter,
  query: DateEventQuery,
})
