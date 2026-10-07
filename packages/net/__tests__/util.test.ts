import {describe, expect, it} from "vitest"
import {DAY} from "@welshman/lib"
import {WRAP} from "@welshman/util"
import {WRAP_DRIFT, catchUpFilter} from "../src/util"

describe("catchUpFilter", () => {
  it("should pick up where the subscription left off", () => {
    expect(catchUpFilter({kinds: [1]}, 1000)).toEqual({kinds: [1], since: 1000})
  })

  it("should drop the limit", () => {
    expect(catchUpFilter({kinds: [1], limit: 0}, 1000)).toEqual({kinds: [1], since: 1000})
    expect(catchUpFilter({kinds: [1], limit: 10}, 1000)).toEqual({kinds: [1], since: 1000})
  })

  it("should reach back past a gift wrap's backdating", () => {
    expect(WRAP_DRIFT).toBe(2 * DAY)
    expect(catchUpFilter({kinds: [WRAP]}, WRAP_DRIFT)).toEqual({kinds: [WRAP], since: 0})
  })

  it("should not reach back for a filter with no kinds", () => {
    expect(catchUpFilter({authors: ["deadbeef"]}, WRAP_DRIFT)).toEqual({
      authors: ["deadbeef"],
      since: WRAP_DRIFT,
    })
  })

  it("should not reach back past the filter's own since", () => {
    expect(catchUpFilter({kinds: [WRAP], since: 100}, WRAP_DRIFT)).toEqual({
      kinds: [WRAP],
      since: 100,
    })
  })
})
