import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getContentWarning} from "../src/behaviors/ContentWarning"
import {Note} from "../src/kinds/Note"
import {buildTemplate, read, write} from "./helpers.js"

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "aa".repeat(32),
    created_at: 0,
    kind: NOTE,
    tags,
    content: "nsfw",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("getContentWarning", () => {
  it("parses a warning with a reason", () => {
    expect(getContentWarning(makeEvent([["content-warning", "nudity"]]))).toEqual({
      reason: "nudity",
    })
  })

  it("parses a bare warning, which is flagged with no reason", () => {
    expect(getContentWarning(makeEvent([["content-warning"]]))).toEqual({reason: undefined})
  })

  it("returns undefined when the tag is absent", () => {
    expect(getContentWarning(makeEvent([["t", "nostr"]]))).toBeUndefined()
  })
})

describe("content warnings", () => {
  it("reads a content-warning tag with a reason", async () => {
    const reader = await read(Note, makeEvent([["content-warning", "nudity"]]))

    expect(reader.contentWarning()).toBe(true)
    expect(reader.contentWarningReason()).toBe("nudity")
  })

  it("reads a bare content-warning tag as flagged with no reason", async () => {
    const reader = await read(Note, makeEvent([["content-warning"]]))

    expect(reader.contentWarning()).toBe(true)
    expect(reader.contentWarningReason()).toBeUndefined()
  })

  it("reports no content warning when the tag is absent", async () => {
    const reader = await read(Note, makeEvent([["t", "nostr"]]))

    expect(reader.contentWarning()).toBe(false)
    expect(reader.contentWarningReason()).toBeUndefined()
  })

  it("writes a content-warning tag with and without a reason", async () => {
    const withReason = await buildTemplate(write(Note).setContentWarning("nudity"))
    const withoutReason = await buildTemplate(write(Note).setContentWarning())

    expect(withReason.tags).toEqual([["content-warning", "nudity"]])
    expect(withoutReason.tags).toEqual([["content-warning"]])
  })

  it("round-trips a content-warning tag through an edit", async () => {
    const reader = await read(Note, makeEvent([["content-warning", "nudity"]]))
    const tmpl = await buildTemplate(write(Note, reader).setContent("still nsfw"))

    expect(tmpl.content).toBe("still nsfw")
    expect(tmpl.tags).toEqual([["content-warning", "nudity"]])
  })

  it("replaces rather than duplicates an existing content-warning tag", async () => {
    const reader = await read(Note, makeEvent([["content-warning", "nudity"]]))
    const tmpl = await buildTemplate(write(Note, reader).setContentWarning("violence"))

    expect(tmpl.tags).toEqual([["content-warning", "violence"]])
  })

  it("clears a content-warning tag", async () => {
    const reader = await read(Note, makeEvent([["content-warning", "nudity"]]))
    const tmpl = await buildTemplate(write(Note, reader).clearContentWarning())

    expect(tmpl.tags).toEqual([])
  })
})
