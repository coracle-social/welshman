import {range, DAY, spec} from "@welshman/lib"
import {EVENT_TIME, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-52 kind-31923 time-based calendar event.
export class TimeEvent extends EventReader {
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

  builder() {
    return new TimeEventBuilder(this)
  }
}

export class TimeEventBuilder extends EventBuilder<TimeEvent> {
  readonly kind = EVENT_TIME

  constructor(readonly reader?: TimeEvent) {
    super(reader)

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
