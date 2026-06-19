import {first} from "@welshman/lib"
import {REPORT, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-56 kind-1984 report.
export class Report extends EventReader {
  readonly kind = REPORT

  reportedPubkey() {
    return getTagValue("p", this.event.tags)
  }

  eventId() {
    return getTag("e", this.event.tags)?.[1]
  }

  reason() {
    return getTag("e", this.event.tags)?.[2]
  }

  builder() {
    return new ReportBuilder(this)
  }
}

export class ReportBuilder extends EventBuilder<Report> {
  readonly kind = REPORT

  reportedPubkey?: string
  eventId?: string
  reason?: string

  constructor(readonly reader?: Report) {
    super(reader)

    const p = first(this.consumeTags("p"))
    const e = first(this.consumeTags("e"))

    this.reportedPubkey = p?.[1]
    this.eventId = e?.[1]
    this.reason = e?.[2]
  }

  setReportedPubkey(reportedPubkey: string) {
    this.reportedPubkey = reportedPubkey

    return this
  }

  setEventId(eventId: string) {
    this.eventId = eventId

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.reportedPubkey) {
      tags.push(["p", this.reportedPubkey])
    }

    if (this.eventId) {
      tags.push(["e", this.eventId, ...(this.reason ? [this.reason] : [])])
    }

    return tags
  }
}
