import {spec, first} from "@welshman/lib"
import {REPORT, matchTag, tagSpec, tagValue, userOutbox} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// NIP-56 kind-1984 report.
export class ReportReader extends EventReader {
  pubkey() {
    return tagValue(tagSpec("p"), this.event.tags)
  }

  eventId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }

  reason() {
    return (
      matchTag(tagSpec("e"), this.event.tags)?.[2] ?? matchTag(tagSpec("p"), this.event.tags)?.[2]
    )
  }
}

export class ReportWriter extends EventWriter<ReportReader> {
  constructor(kind: number, context: KindContext, reader?: ReportReader) {
    super(kind, context, reader)

    // A report's reason lives on both the p and e tags; normalize so a reason
    // present on either is reflected on both.
    const reason = this.reason()

    if (reason) {
      this.setReason(reason)
    }
  }

  protected async renderRoutes() {
    return [userOutbox()]
  }

  private reason() {
    const eTag = first(this.extraTags.filter(spec(["e"])))
    const pTag = first(this.extraTags.filter(spec(["p"])))

    return (eTag?.[2] ?? pTag?.[2]) as string | undefined
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

export class ReportQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Report = new KindFactory({
  kind: REPORT,
  reader: ReportReader,
  writer: ReportWriter,
  query: ReportQuery,
})
