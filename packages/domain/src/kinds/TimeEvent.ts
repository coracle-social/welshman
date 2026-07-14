import {range, DAY, spec} from "@welshman/lib"
import {EVENT_TIME, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"
import type {AnyConfiguredKind} from "../core/Kind.js"

// NIP-52 kind-31923 time-based calendar event.
export class TimeEventReader extends EventReader {
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

export class TimeEventWriter extends EventWriter<TimeEventReader> {
  constructor(def: AnyConfiguredKind, reader?: TimeEventReader) {
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

    const start = parseInt((this.extraTags.find(spec(["start"]))?.[1] ?? "") as string)
    const end = parseInt((this.extraTags.find(spec(["end"]))?.[1] ?? "") as string)

    if (!isNaN(start) && !isNaN(end)) {
      for (const t of range(start, end, DAY)) {
        tags.push(["D", String(Math.floor(t / DAY))])
      }
    }

    return tags
  }
}

export const TimeEvent = new KindFactory({
  kind: EVENT_TIME,
  reader: TimeEventReader,
  writer: TimeEventWriter,
})
