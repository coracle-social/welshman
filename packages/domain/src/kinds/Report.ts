import {first} from "@welshman/lib"
import {REPORT, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-56 kind-1984 report, feeding flotilla's admin action-items / moderation
// review queue (see app/actionItems.ts `deriveSpaceActionItems`). The reported
// author is named in the "p" tag and the reported event in the "e" tag, with the
// report reason carried as the 3rd element of the "e" tag (NOT a separate tag).
// Flotilla destructures this by hand in ReactionSummary.svelte and
// ReportMenu.svelte; the accessors centralize that access. The report body lives
// in `content` as plain text (not JSON).
export class Report extends EventReader {
  readonly kind = REPORT

  // The reported author. Distinct from the base `pubkey()` (the reporter).
  reportedPubkey() {
    return getTagValue("p", this.event.tags)
  }

  // The reported event, if any.
  eventId() {
    return getTag("e", this.event.tags)?.[1]
  }

  // The report reason, carried as the 3rd element of the "e" tag.
  reason() {
    return getTag("e", this.event.tags)?.[2]
  }

  // The report body, plain text.
  content() {
    return this.event.content || ""
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
  content = ""

  constructor(readonly reader?: Report) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const p = first(this.consumeTags("p"))
    const e = first(this.consumeTags("e"))

    this.reportedPubkey = p?.[1]
    this.eventId = e?.[1]
    this.reason = e?.[2]
    this.content = reader?.event.content ?? ""
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

  setContent(content: string) {
    this.content = content

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

  protected buildContent() {
    return this.content
  }
}
