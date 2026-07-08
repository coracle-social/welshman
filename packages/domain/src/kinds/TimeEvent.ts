import {range, DAY, spec} from "@welshman/lib"
import {EVENT_TIME, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"
import type {AnyKind} from "../Kind.js"

// NIP-52 kind-31923 time-based calendar event.
export class TimeEventReader extends EventReader {
  readonly kind = EVENT_TIME

  title() {
    return getTagValue("title", this.event.tags)
  }

  location() {
    return getTagValue("location", this.event.tags)
  }

  start() {
    const start = parseInt(getTagValue("start", this.event.tags)!)

    return isNaN(start) ? undefined : start
  }

  end() {
    const end = parseInt(getTagValue("end", this.event.tags)!)

    return isNaN(end) ? undefined : end
  }
}

export class TimeEventBuilder extends EventBuilder<TimeEventReader> {
  readonly kind = EVENT_TIME

  constructor(def: AnyKind, reader?: TimeEventReader) {
    super(def, reader)

    this.consumeTags("D")
  }

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setLocation(location: string) {
    return this.dropTags(spec(["location"])).addTags(["location", location])
  }

  setStart(start: number) {
    return this.dropTags(spec(["start"])).addTags(["start", String(start)])
  }

  setEnd(end: number) {
    return this.dropTags(spec(["end"])).addTags(["end", String(end)])
  }

  protected buildTags() {
    const tags: string[][] = []

    const start = parseInt(this.extraTags.find(spec(["start"]))?.[1] ?? "")
    const end = parseInt(this.extraTags.find(spec(["end"]))?.[1] ?? "")

    if (!isNaN(start) && !isNaN(end)) {
      for (const t of range(start, end, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return tags
  }
}

export const TimeEvent = new Kind({
  reader: TimeEventReader,
  builder: TimeEventBuilder,
  router: OutboxRouter,
})
