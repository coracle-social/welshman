import {spec, first} from "@welshman/lib"
import {REPORT, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {ContentRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"
import type {AnyKind} from "../Kind.js"

// NIP-56 kind-1984 report.
export class ReportReader extends EventReader {
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
}

export class ReportBuilder extends EventBuilder<ReportReader> {
  readonly kind = REPORT

  constructor(def: AnyKind, reader?: ReportReader) {
    super(def, reader)

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

export const Report = new Kind({
  reader: ReportReader,
  builder: ReportBuilder,
  router: ContentRouter,
})
