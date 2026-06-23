import {spec, first} from "@welshman/lib"
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

  constructor(reader?: Report) {
    super(reader)

    // A report's reason lives on both the p and e tags; normalize so a reason
    // present on either is reflected on both.
    const reason = this.reason()

    if (reason) {
      this.setReason(reason)
    }
  }

  private reason() {
    const eTag = first(this.extraTags.filter(spec(["e"])))
    const pTag = first(this.extraTags.filter(spec(["p"])))

    return eTag?.[2] ?? pTag?.[2]
  }

  setPubkey(pubkey: string) {
    const reason = this.reason()
    const tag = reason ? ["p", pubkey, reason] : ["p", pubkey]

    return this.dropTags(spec(["p"])).addTags(tag)
  }

  setEventId(eventId: string) {
    const reason = this.reason()
    const tag = reason ? ["e", eventId, reason] : ["e", eventId]

    return this.dropTags(spec(["e"])).addTags(tag)
  }

  setReason(reason: string) {
    const pTag = first(this.extraTags.filter(spec(["p"])))
    const eTag = first(this.extraTags.filter(spec(["e"])))

    if (pTag) {
      this.dropTags(spec(["p"])).addTags(["p", pTag[1], reason])
    }

    if (eTag) {
      this.dropTags(spec(["e"])).addTags(["e", eTag[1], reason])
    }

    return this
  }
}
