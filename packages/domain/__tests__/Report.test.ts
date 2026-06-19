import {describe, it, expect} from "vitest"
import {makeSecret, REPORT, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Report, ReportBuilder} from "../src/kinds/Report"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const reported = "aa".repeat(32)
const eventId = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: REPORT,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Report", () => {
  it("reads represented tags and content", async () => {
    const event = makeEvent({
      content: "this is spam",
      tags: [
        ["p", reported],
        ["e", eventId, "spam"],
        ["alt", "x"],
      ],
    })

    const report = await Report.fromEvent(event)

    expect(report.reportedPubkey()).toBe(reported)
    expect(report.eventId()).toBe(eventId)
    expect(report.reason()).toBe("spam")
    expect(report.content()).toBe("this is spam")
  })

  it("round-trips with no duplicate represented tags", async () => {
    const event = makeEvent({
      content: "this is spam",
      tags: [
        ["p", reported],
        ["e", eventId, "spam"],
        ["alt", "x"],
      ],
    })

    const tmpl = await (await Report.fromEvent(event)).builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["p", reported])
    expect(tmpl.tags).toContainEqual(["e", eventId, "spam"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("this is spam")
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new ReportBuilder()
      .setReportedPubkey(reported)
      .setEventId(eventId)
      .setReason("impersonation")
      .setContent("bad actor")
      .toTemplate(signer)

    expect(tmpl.kind).toBe(REPORT)
    expect(tmpl.tags).toContainEqual(["p", reported])
    expect(tmpl.tags).toContainEqual(["e", eventId, "impersonation"])
    expect(tmpl.content).toBe("bad actor")
  })

  it("throws on the wrong kind", async () => {
    await expect(Report.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
