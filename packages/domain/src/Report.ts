import {REPORT, getTag, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-56 kind-1984 report, feeding flotilla's admin action-items / moderation
// review queue (see app/actionItems.ts `deriveSpaceActionItems`). The reported
// author is named in the "p" tag and the reported event in the "e" tag, with the
// report reason carried as the 3rd element of the "e" tag (NOT a separate tag).
// Flotilla destructures this by hand in ReactionSummary.svelte and
// ReportMenu.svelte; the accessors centralize that access. The report body lives
// in `content` as plain text (not JSON), so there's no `plain` representation.
export class Report extends EventReader {
  static kind = REPORT

  protected reservedTagKeys() {
    return ["p", "e"]
  }

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
    const builder = new ReportBuilder()

    builder.reportedPubkey = this.reportedPubkey()
    builder.eventId = this.eventId()
    builder.reason = this.reason()
    builder.content = this.content()

    return this.seedBuilder(builder)
  }
}

export class ReportBuilder extends EventBuilder {
  static kind = REPORT

  reportedPubkey?: string
  eventId?: string
  reason?: string
  content = ""

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
