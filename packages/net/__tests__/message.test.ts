import {describe, expect, it} from "vitest"
import {RelayReasonPrefix, isTerminalReason, matchReason} from "../src/message"

describe("matchReason", () => {
  it("should match a bare nip 01 prefix", () => {
    expect(
      matchReason(RelayReasonPrefix.AuthRequired, "auth-required: we can't serve stoats"),
    ).toBe(true)
  })

  it("should match a prefix behind a label", () => {
    expect(
      matchReason(RelayReasonPrefix.AuthRequired, "ERROR: auth-required: we can't serve stoats"),
    ).toBe(true)
  })

  it("should not match a different prefix", () => {
    expect(matchReason(RelayReasonPrefix.AuthRequired, "restricted: we can't serve stoats")).toBe(
      false,
    )
  })

  it("should not match a prefix mentioned mid-word", () => {
    expect(matchReason(RelayReasonPrefix.AuthRequired, "error: not-auth-required: whatever")).toBe(
      false,
    )
  })
})

describe("isTerminalReason", () => {
  it("should match any terminal prefix", () => {
    expect(isTerminalReason("blocked: nope")).toBe(true)
    expect(isTerminalReason("ERROR: restricted: nope")).toBe(true)
    expect(isTerminalReason("duplicate: nope")).toBe(false)
  })

  it("should not match a missing reason", () => {
    expect(isTerminalReason()).toBe(false)
  })
})
