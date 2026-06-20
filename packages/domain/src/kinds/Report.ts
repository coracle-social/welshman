import {first} from "@welshman/lib"
import {REPORT, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-56 kind-1984 report.
export class Report extends EventReader {
  readonly kind = REPORT

  pubkey() {
    return getTagValue("p", this.event.tags)
  }

  eventId() {
    return getTag("e", this.event.tags)?.[1]
  }

  reason() {
    return getTag("e", this.event.tags)?.[2] ?? getTag("p", this.event.tags)?.[2]
  }

  builder() {
    return new ReportBuilder(this)
  }
}

export class ReportBuilder extends EventBuilder<Report> {
  readonly kind = REPORT

  pTag?: string[]
  eTag?: string[]
  reason?: string

  constructor(readonly reader?: Report) {
    super(reader)

    this.pTag = first(this.consumeTags("p"))
    this.eTag = first(this.consumeTags("e"))
    this.reason = this.eTag?.[2] ?? this.pTag?.[2]
  }

  setPubkey(pubkey: string) {
    this.pTag = ["p", pubkey]

    return this
  }

  setEventId(eventId: string) {
    this.eTag = ["e", eventId]

    return this
  }

  setReason(reason: string) {
    this.reason = reason

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.pTag) {
      if (this.pTag.length === 2) {
        this.pTag.push(this.reason)
      }

      tags.push(this.pTag)
    }

    if (this.eTag) {
      if (this.eTag.length === 2) {
        this.eTag.push(this.reason)
      }

      tags.push(this.eTag)
    }

    return tags
  }
}
