import {first, range, DAY} from "@welshman/lib"
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

  titleTag?: string[]
  locationTag?: string[]
  start?: number
  end?: number

  constructor(readonly reader?: TimeEvent) {
    super(reader)

    const start = first(this.consumeTags("start"))
    const end = first(this.consumeTags("end"))

    this.consumeTags("D")

    this.titleTag = first(this.consumeTags("title"))
    this.locationTag = first(this.consumeTags("location"))
    this.start = start ? (isNaN(parseInt(start[1])) ? undefined : parseInt(start[1])) : undefined
    this.end = end ? (isNaN(parseInt(end[1])) ? undefined : parseInt(end[1])) : undefined
  }

  setTitle(title: string) {
    this.titleTag = ["title", title]

    return this
  }

  setLocation(location: string) {
    this.locationTag = ["location", location]

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

  protected buildTags() {
    const tags: string[][] = []

    if (this.titleTag) tags.push(this.titleTag)
    if (this.locationTag) tags.push(this.locationTag)
    if (this.start !== undefined) tags.push(["start", String(this.start)])
    if (this.end !== undefined) tags.push(["end", String(this.end)])

    if (this.start !== undefined && this.end !== undefined) {
      for (const t of range(this.start, this.end, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return tags
  }
}
