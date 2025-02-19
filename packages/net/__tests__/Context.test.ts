import type {Filter, TrustedEvent} from "@welshman/util"
import {hasValidSignature, isSignedEvent, LOCAL_RELAY_URL, matchFilters} from "@welshman/util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {AuthMode} from "../src/ConnectionAuth"
import {
  defaultOptimizeSubscriptions,
  eventValidationScores,
  getDefaultNetContext,
  isEventValid,
} from "../src/Context"

// Mock utilities that are imported
vi.mock(import("@welshman/util"), async importOriginal => ({
  ...(await importOriginal()),
  isSignedEvent: vi.fn(),
  hasValidSignature: vi.fn(),
  matchFilters: vi.fn(),
  LOCAL_RELAY_URL: "local",
}))

describe("Context", () => {
  describe("getDefaultNetContext", () => {
    it("should return default context with expected properties", () => {
      const context = getDefaultNetContext()

      expect(context).toEqual(
        expect.objectContaining({
          authMode: AuthMode.Implicit,
          onEvent: expect.any(Function),
          signEvent: expect.any(Function),
          isDeleted: expect.any(Function),
          isValid: expect.any(Function),
          getExecutor: expect.any(Function),
          matchFilters: expect.any(Function),
          optimizeSubscriptions: expect.any(Function),
        }),
      )
    })

    it("should merge overrides with defaults", () => {
      const customOnEvent = vi.fn()
      const context = getDefaultNetContext({onEvent: customOnEvent})

      expect(context.onEvent).toBe(customOnEvent)
      expect(context.authMode).toBe(AuthMode.Implicit) // default value preserved
    })
  })

  describe("defaultOptimizeSubscriptions", () => {
    it("should group subscriptions by relay", () => {
      const subs = [
        {
          request: {
            relays: ["relay1", "relay2"],
            filters: [{kinds: [1]}],
          },
        },
        {
          request: {
            relays: ["relay1"],
            filters: [{kinds: [2]}],
          },
        },
      ] as any

      const result = defaultOptimizeSubscriptions(subs)
      // should unionize filters for requests with the same relay
      expect(result).toEqual([
        {
          relays: ["relay1"],
          filters: expect.arrayContaining([{kinds: [1, 2]}]),
        },
        {
          relays: ["relay2"],
          filters: [{kinds: [1]}],
        },
      ])
    })

    it("should deduplicate relays", () => {
      const subs = [
        {
          request: {
            relays: ["relay1", "relay1"],
            filters: [{kinds: [1]}],
          },
        },
      ] as any

      const result = defaultOptimizeSubscriptions(subs)

      expect(result).toHaveLength(1)
      expect(result[0].relays).toEqual(["relay1"])
    })
  })

  describe("isEventValid", () => {
    const mockEvent = {id: "123"} as TrustedEvent
    beforeEach(() => {
      eventValidationScores.clear()
      // vi.mocked(isSignedEvent)
      // vi.mocked(hasValidSignature)
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it("should always return true for LOCAL_RELAY_URL", () => {
      expect(isEventValid(LOCAL_RELAY_URL, mockEvent)).toBe(true)
    })

    it("should validate signature for non-local events", () => {
      vi.mocked(isSignedEvent).mockReturnValue(true)
      vi.mocked(hasValidSignature).mockReturnValue(true)

      const result = isEventValid("relay1", mockEvent)

      expect(isSignedEvent).toHaveBeenCalledWith(mockEvent)
      expect(hasValidSignature).toHaveBeenCalledWith(mockEvent)
      expect(result).toBe(true)
    })

    it("should update validation score on successful validation", () => {
      vi.mocked(isSignedEvent).mockReturnValue(true)
      vi.mocked(hasValidSignature).mockReturnValue(true)

      isEventValid("relay1", mockEvent)

      expect(eventValidationScores.get("relay1")).toBe(1)
    })

    it("should reset validation score on failed validation", () => {
      // Set initial score
      eventValidationScores.set("relay1", 10)

      vi.mocked(isSignedEvent).mockReturnValue(false)
      vi.mocked(hasValidSignature).mockReturnValue(true)

      isEventValid("relay1", mockEvent)

      expect(eventValidationScores.get("relay1")).toBe(0)
    })

    it("should skip validation when score is high enough", () => {
      eventValidationScores.set("relay1", 1000)

      const result = isEventValid("relay1", mockEvent)

      expect(isSignedEvent).not.toHaveBeenCalled()
      expect(hasValidSignature).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it("should maintain minimum validation rate", () => {
      eventValidationScores.set("relay1", 800)
      vi.spyOn(Math, "random").mockReturnValue(1000) // ensure randomInt returns
      vi.mocked(isSignedEvent).mockReturnValue(true)
      vi.mocked(hasValidSignature).mockReturnValue(true)

      isEventValid("relay1", mockEvent)

      expect(eventValidationScores.get("relay1")).toBe(801)
    })
  })

  describe("default functions behavior", () => {
    const context = getDefaultNetContext()

    it("default onEvent should not throw", () => {
      expect(() => context.onEvent("relay1", {} as TrustedEvent)).not.toThrow()
    })

    it("default signEvent should return undefined", async () => {
      const result = await context.signEvent({} as any)
      expect(result).toBeUndefined()
    })

    it("default isDeleted should return false", () => {
      expect(context.isDeleted("relay1", {} as TrustedEvent)).toBe(false)
    })

    it("default matchFilters should use util matchFilters", () => {
      const filters: Filter[] = []
      const event = {} as TrustedEvent

      context.matchFilters("relay1", filters, event)

      expect(vi.mocked(matchFilters)).toHaveBeenCalledWith(filters, event)
    })
  })
})
