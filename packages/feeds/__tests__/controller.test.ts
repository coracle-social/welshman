import {describe, it, expect, vi, beforeEach} from "vitest"
import {FeedController} from "../src/controller"
import {Feed, FeedOptions, FeedType} from "../src/core"
import {EPOCH, type TrustedEvent} from "@welshman/util"
import {now} from "@welshman/lib"

describe("FeedController", () => {
  let mockRequest: ReturnType<typeof vi.fn>
  let mockOnEvent: ReturnType<typeof vi.fn>
  let mockOnExhausted: ReturnType<typeof vi.fn>
  let mockRequestDVM: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockRequest = vi.fn()
    mockOnEvent = vi.fn()
    mockOnExhausted = vi.fn()
    mockRequestDVM = vi.fn()
  })

  const createEvent = (id: string, created_at: number): TrustedEvent => ({
    id,
    pubkey: "pub1",
    created_at,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig1",
  })

  const createFeedOptions = (feed: Feed, useWindowing = false): FeedOptions => ({
    getPubkeysForScope: vi.fn().mockReturnValue(["pubkey1", "pubkey2"]),
    getPubkeysForWOTRange: vi.fn().mockReturnValue(["pubkey3", "pubkey4"]),
    feed,
    request: mockRequest,
    requestDVM: mockRequestDVM,
    onEvent: mockOnEvent,
    onExhausted: mockOnExhausted,
    useWindowing,
  })

  describe("Basic Loading", () => {
    it("should load events from simple feed", async () => {
      const controller = new FeedController(createFeedOptions([FeedType.Author, "pub1"]))

      mockRequest.mockImplementation(({onEvent}) => {
        onEvent(createEvent("1", 1000))
        onEvent(createEvent("2", 900))
      })

      await controller.load(10)

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([expect.objectContaining({authors: ["pub1"]})]),
        }),
      )
      expect(mockOnEvent).toHaveBeenCalledTimes(2)
    })

    it("should handle windowing", async () => {
      const controller = new FeedController(createFeedOptions([FeedType.Author, "pub1"], true))

      mockRequest.mockImplementation(({onEvent}) => {
        onEvent(createEvent("1", 1000))
      })

      await controller.load(10)
      await controller.load(10) // Should load next window

      expect(mockRequest).toHaveBeenCalledTimes(2)
      expect(mockRequest.mock.calls[1][0].filters[0].until).toBeLessThan(
        mockRequest.mock.calls[0][0].filters[0].until,
      )
    })
  })

  describe("Complex Feed Types", () => {
    it("should handle Union feeds", async () => {
      const controller = new FeedController(
        createFeedOptions([FeedType.Union, [FeedType.Author, "pub1"], [FeedType.Author, "pub2"]]),
      )

      mockRequest.mockImplementation(({filters, onEvent}) => {
        if (filters[0].authors?.includes("pub1")) {
          onEvent(createEvent("1", 1000))
        }
        if (filters[0].authors?.includes("pub2")) {
          onEvent(createEvent("2", 900))
        }
      })

      await controller.load(10)

      expect(mockOnEvent).toHaveBeenCalledTimes(2)
    })

    it("should handle Intersection feeds", async () => {
      const controller = new FeedController(
        createFeedOptions([FeedType.Intersection, [FeedType.Author, "pub1"], [FeedType.Kind, 1]]),
      )

      const event = createEvent("1", 1000)
      mockRequest.mockImplementation(({onEvent}) => {
        onEvent(event)
      })

      await controller.load(10)

      expect(mockOnEvent).toHaveBeenCalledWith(event)
    })

    it("should handle Difference feeds", async () => {
      const controller = new FeedController(
        createFeedOptions([
          FeedType.Difference,
          [FeedType.Author, "pub1"],
          [FeedType.Author, "pub2"],
        ]),
      )

      mockRequest.mockImplementation(({filters, onEvent}) => {
        if (filters[0].authors?.includes("pub1")) {
          onEvent(createEvent("1", 1000))
          onEvent(createEvent("2", 900))
        }
        if (filters[0].authors?.includes("pub2")) {
          onEvent(createEvent("2", 900)) // This one should be excluded
        }
      })

      await controller.load(10)

      expect(mockOnEvent).toHaveBeenCalledTimes(1)
      expect(mockOnEvent).toHaveBeenCalledWith(expect.objectContaining({id: "1"}))
    })
  })

  describe("Event Deduplication", () => {
    it("should not emit duplicate events", async () => {
      const controller = new FeedController(createFeedOptions([FeedType.Author, "pub1"]))

      const event = createEvent("1", 1000)
      mockRequest.mockImplementation(({onEvent}) => {
        onEvent(event)
        onEvent(event) // Duplicate
      })

      await controller.load(10)

      expect(mockOnEvent).toHaveBeenCalledTimes(1)
    })
  })

  describe("Exhaustion Handling", () => {
    it("should call onExhausted when no more events", async () => {
      const controller = new FeedController(createFeedOptions([FeedType.Author, "pub1"]))

      mockRequest.mockImplementation(({onEvent}) => {
        // No events returned
      })

      await controller.load(10)

      expect(mockOnExhausted).toHaveBeenCalled()
    })

    it("should handle exhaustion in complex feeds", async () => {
      const controller = new FeedController(
        createFeedOptions([FeedType.Union, [FeedType.Author, "pub1"], [FeedType.Author, "pub2"]]),
      )

      mockRequest.mockImplementation(() => {
        // No events returned
      })

      await controller.load(10)

      expect(mockOnExhausted).toHaveBeenCalled()
    })
  })

  describe("Filter Handling", () => {
    it("should handle time-based filters", async () => {
      const controller = new FeedController(createFeedOptions([FeedType.Author, "pub1"]))

      await controller.load(10)

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({
              since: EPOCH,
              until: now(),
            }),
          ]),
        }),
      )
    })

    it("should respect existing filter constraints", async () => {
      const since = 1000
      const until = 2000
      const controller = new FeedController(
        createFeedOptions([
          FeedType.Intersection,
          [FeedType.Author, "pub1"],
          [FeedType.CreatedAt, {since, until}],
        ]),
      )

      mockRequest.mockImplementation(({filters, onEvent}) => {
        expect(filters[0].since).toBeGreaterThanOrEqual(since)
        expect(filters[0].until).toBeLessThanOrEqual(until)
        onEvent(createEvent("1", 1500))
      })

      await controller.load(10)
    })
  })

  describe("Error Handling", () => {
    it("should handle request errors gracefully", async () => {
      const controller = new FeedController({
        ...createFeedOptions([FeedType.Author, "pub1"]),
        request: () => {
          throw new Error("Request failed")
        },
        onEvent: mockOnEvent,
      })

      await expect(controller.load(10)).rejects.toThrow("Request failed")
    })

    it("should handle invalid feed types", async () => {
      const controller = new FeedController({
        ...createFeedOptions(["InvalidType", "value"] as any),
        request: mockRequest,
      })

      await expect(controller.load(10)).rejects.toThrow()
    })
  })
})
