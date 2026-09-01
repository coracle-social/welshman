import {describe, expect, it} from "vitest"
import {matchReason, matchReasons} from "../src/message"

describe("matchReason", () => {
  it("should match a bare nip 01 prefix", () => {
    expect(matchReason("auth-required: we can't serve stoats", "auth-required")).toBe(true)
  })

  it("should match a prefix behind a label", () => {
    expect(matchReason("ERROR: auth-required: we can't serve stoats", "auth-required")).toBe(true)
  })

  it("should not match a different prefix", () => {
    expect(matchReason("restricted: we can't serve stoats", "auth-required")).toBe(false)
  })

  it("should not match a prefix mentioned mid-word", () => {
    expect(matchReason("error: not-auth-required: whatever", "auth-required")).toBe(false)
  })

  it("should not match a missing reason", () => {
    expect(matchReason(undefined, "auth-required")).toBe(false)
  })
})

describe("matchReasons", () => {
  it("should match any of the given prefixes", () => {
    expect(matchReasons("blocked: nope", ["restricted", "blocked"])).toBe(true)
    expect(matchReasons("restricted: nope", ["restricted", "blocked"])).toBe(true)
    expect(matchReasons("duplicate: nope", ["restricted", "blocked"])).toBe(false)
  })
})
