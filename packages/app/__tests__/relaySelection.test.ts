import * as util from "@welshman/util"
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest"
import * as relaySelectionModule from "../src/relaySelections"

// Mock dependencies
vi.mock("@welshman/util", async imports => {
  return {
    ...(await imports()),
    normalizeRelayUrl: vi.fn(url => url),
    asDecryptedEvent: vi.fn(event => event),
    readList: vi.fn(),
    getListTags: vi.fn(() => []),
    getRelayTags: vi.fn(() => []),
    getRelayTagValues: vi.fn(() => []),
  }
})

vi.mock("@welshman/store", async imports => {
  return {
    ...(await imports()),
    deriveEventsMapped: vi.fn(() => ({subscribe: () => ({unsubscribe: () => {}})})),
  }
})

vi.mock("../src/subscribe.js", () => ({
  load: vi.fn().mockResolvedValue([]),
}))

vi.mock("../src/collection.js", () => ({
  collection: vi.fn(() => ({
    indexStore: {},
    deriveItem: vi.fn(),
    loadItem: vi.fn(),
  })),
}))

describe("relaySelections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getRelayUrls", () => {
    test("returns unique normalized relay URLs", () => {
      // Setup
      const mockList = {
        tags: [
          ["r", "wss://relay1.com"],
          ["r", "wss://relay2.com"],
        ],
      }
      vi.mocked(util.getListTags).mockReturnValue(mockList.tags)
      vi.mocked(util.getRelayTagValues).mockReturnValue([
        "wss://relay1.com",
        "wss://relay2.com",
        "wss://relay1.com",
      ])

      // Execute
      const result = relaySelectionModule.getRelayUrls(mockList)

      // Verify
      expect(util.getListTags).toHaveBeenCalledWith(mockList)
      expect(util.getRelayTagValues).toHaveBeenCalledWith(mockList.tags)
      expect(util.normalizeRelayUrl).toHaveBeenCalledTimes(3)
      expect(result).toEqual(["wss://relay1.com", "wss://relay2.com"])
    })

    test("returns empty array when list is undefined", () => {
      vi.mocked(util.getListTags).mockReturnValue([])
      vi.mocked(util.getRelayTagValues).mockReturnValue([])

      const result = relaySelectionModule.getRelayUrls(undefined)

      expect(result).toEqual([])
    })
  })

  describe("getReadRelayUrls", () => {
    test("returns read relay URLs", () => {
      // Setup
      const mockTags = [
        ["r", "wss://relay1.com", "read"],
        ["r", "wss://relay2.com", "write"],
        ["r", "wss://relay3.com"], // no marker is also read
        ["r", "wss://relay4.com", "read"],
      ]
      vi.mocked(util.getListTags).mockReturnValue(mockTags)
      vi.mocked(util.getRelayTags).mockReturnValue(mockTags)

      // Execute
      const result = relaySelectionModule.getReadRelayUrls({tags: mockTags})

      // Verify
      expect(result).toEqual(["wss://relay1.com", "wss://relay3.com", "wss://relay4.com"])
    })
  })

  describe("getWriteRelayUrls", () => {
    test("returns write relay URLs", () => {
      // Setup
      const mockTags = [
        ["r", "wss://relay1.com", "read"],
        ["r", "wss://relay2.com", "write"],
        ["r", "wss://relay3.com"], // no marker is also write
        ["r", "wss://relay4.com", "write"],
      ]
      vi.mocked(util.getListTags).mockReturnValue(mockTags)
      vi.mocked(util.getRelayTags).mockReturnValue(mockTags)

      // Execute
      const result = relaySelectionModule.getWriteRelayUrls({tags: mockTags})

      // Verify
      expect(result).toEqual(["wss://relay2.com", "wss://relay3.com", "wss://relay4.com"])
    })
  })
})
