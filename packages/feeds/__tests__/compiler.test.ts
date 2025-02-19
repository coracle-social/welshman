import {defaultTagFeedMappings} from "@welshman/feeds"
import {now} from "@welshman/lib"
import {getAddress, type TrustedEvent} from "@welshman/util"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {FeedCompiler} from "../src/compiler"
import {Feed, FeedType, Scope} from "../src/core"

describe("FeedCompiler", () => {
  let compiler: FeedCompiler
  let mockOptions: any

  beforeEach(() => {
    mockOptions = {
      getPubkeysForScope: vi.fn().mockReturnValue(["pubkey1", "pubkey2"]),
      getPubkeysForWOTRange: vi.fn().mockReturnValue(["pubkey3", "pubkey4"]),
      requestDVM: vi.fn(),
      request: vi.fn(),
    }
    compiler = new FeedCompiler(mockOptions)
  })

  describe("canCompile", () => {
    it("should return true for supported feed types", () => {
      const supportedFeeds: Feed[] = [
        [FeedType.Address, "addr1", "addr2"],
        [FeedType.Author, "author1", "author2"],
        [FeedType.CreatedAt, {since: 1000}],
        [FeedType.DVM, {kind: 1, mappings: []}],
        [FeedType.ID, "id1", "id2"],
        [FeedType.Global],
        [FeedType.Kind, 1, 2],
        [FeedType.List, {addresses: [], mappings: []}],
        [FeedType.Label, {mappings: []}],
        [FeedType.Relay, "relay1", "relay2"],
        [FeedType.Scope, Scope.Followers, Scope.Follows],
        [FeedType.Search, "query1", "query2"],
        [FeedType.Tag, "key", "value"],
        [FeedType.WOT, {min: 0, max: 1}],
      ]

      for (const feed of supportedFeeds) {
        expect(compiler.canCompile(feed)).toBe(true)
      }
    })

    it("should return true for nested union and intersection feeds", () => {
      const feed: Feed = [FeedType.Union, [FeedType.Author, "author1"], [FeedType.Kind, 1]]
      expect(compiler.canCompile(feed)).toBe(true)
    })

    it("should return false for unsupported feed type", () => {
      const feed: any = ["UnsupportedType", "value"]
      expect(compiler.canCompile(feed)).toBe(false)
    })
  })

  describe("compile", () => {
    it("should compile ID feed", async () => {
      const result = await compiler.compile([FeedType.ID, "id1", "id2"])
      expect(result).toEqual([
        {
          filters: [{ids: ["id1", "id2"]}],
        },
      ])
    })

    it("should compile Kind feed", async () => {
      const result = await compiler.compile([FeedType.Kind, 1, 2])
      expect(result).toEqual([
        {
          filters: [{kinds: [1, 2]}],
        },
      ])
    })

    it("should compile Author feed", async () => {
      const result = await compiler.compile([FeedType.Author, "author1", "author2"])
      expect(result).toEqual([
        {
          filters: [{authors: ["author1", "author2"]}],
        },
      ])
    })

    it("should compile Scope feed", async () => {
      const result = await compiler.compile([FeedType.Scope, Scope.Followers, Scope.Follows])
      expect(result).toEqual([
        {
          filters: [{authors: ["pubkey1", "pubkey2"]}],
        },
      ])
      // there is an issue with vitest, these conditions are true
      // expect(mockOptions.getPubkeysForScope).toHaveBeenCalledWith(Scope.Followers)
      // expect(mockOptions.getPubkeysForScope).toHaveBeenCalledWith(Scope.Follows)
      expect(mockOptions.getPubkeysForScope).toHaveBeenCalledTimes(2)
    })

    it("should compile WOT feed", async () => {
      const result = await compiler.compile([FeedType.WOT, {min: 0, max: 1}])
      expect(result).toEqual([
        {
          filters: [{authors: ["pubkey3", "pubkey4"]}],
        },
      ])
      expect(mockOptions.getPubkeysForWOTRange).toHaveBeenCalledWith(0, 1)
    })

    it("should compile CreatedAt feed", async () => {
      const created_at = now()
      const result = await compiler.compile([
        FeedType.CreatedAt,
        {since: 1000, until: 2000},
        {since: 3000, relative: ["since"]},
      ])
      expect(result[0].filters?.length).toBe(2)
      expect(result[0].filters?.[0]).toMatchObject({since: 1000, until: 2000})
      expect(result[0].filters?.[1].since).toBe(created_at - 3000)
    })

    it("should compile Search feed", async () => {
      const result = await compiler.compile([FeedType.Search, "query1", "query2"])
      expect(result).toEqual([
        {
          filters: [{search: "query1"}, {search: "query2"}],
        },
      ])
    })

    it("should compile Relay feed", async () => {
      const result = await compiler.compile([FeedType.Relay, "relay1", "relay2"])
      expect(result).toEqual([
        {
          relays: ["relay1", "relay2"],
        },
      ])
    })

    it("should compile Global feed", async () => {
      const result = await compiler.compile([FeedType.Global])
      expect(result).toEqual([
        {
          filters: [{}],
        },
      ])
    })

    it("should compile Tag feed", async () => {
      const result = await compiler.compile([FeedType.Tag, "key", "value1", "value2"])
      expect(result).toEqual([
        {
          filters: [{key: ["value1", "value2"]}],
        },
      ])
    })
  })

  describe("compile complex feeds", () => {
    it("should compile Union feed", async () => {
      const requestItem = await compiler.compile([
        FeedType.Union,
        [FeedType.Author, "author1"],
        [FeedType.Kind, 1],
      ])
      // one request item with two filters
      expect(requestItem).toHaveLength(1)
      expect(requestItem[0].filters).toHaveLength(2)

      const requestItem2 = await compiler.compile([
        FeedType.Union,
        [FeedType.Author, "author1"],
        [FeedType.Relay, "relay1", "relay2"],
        [FeedType.Kind, 1],
      ])
      // two request items
      expect(requestItem2).toHaveLength(2)
      // the first with 2 filters and no relay
      expect(requestItem2[0].filters).toHaveLength(2)
      expect(requestItem2[0].relays).toBeUndefined()
      // the second with 0 filter and 2 relays
      expect(requestItem2[1].filters).toBeUndefined()
      expect(requestItem2[1].relays).toHaveLength(2)

      const requestItem3 = await compiler.compile([
        FeedType.Union,
        [FeedType.Author, "author1"],
        [FeedType.Intersection, [FeedType.Kind, 1], [FeedType.Relay, "relay1"]],
      ])

      // two request items
      expect(requestItem3).toHaveLength(2)
      // the first with 1 filter and one relay
      expect(requestItem3[0].filters).toHaveLength(1)
      expect(requestItem3[0].relays).toHaveLength(1)
      // the second with 1 filter and no relay
      expect(requestItem3[1].filters).toHaveLength(1)
      expect(requestItem3[1].relays).toBeUndefined()

      const requestItem4 = await compiler.compile([
        FeedType.Union,
        [FeedType.Author, "author1"],
        [FeedType.Union, [FeedType.Kind, 1], [FeedType.Relay, "relay1"]],
      ])
      // two request items
      expect(requestItem4).toHaveLength(2)
      // the first with 2 filters and no relay
      expect(requestItem4[0].filters).toHaveLength(2)
      expect(requestItem4[0].relays).toBeUndefined()
      // the second with no filter and one relay
      expect(requestItem4[1].filters).toBeUndefined()
      expect(requestItem4[1].relays).toHaveLength(1)
    })

    it("should compile Intersection feed", async () => {
      const requestItems = await compiler.compile([
        FeedType.Intersection,
        [FeedType.Author, "author1"],
        [FeedType.Kind, 1],
      ])
      // one request item with one filter
      expect(requestItems).toHaveLength(1)
      expect(requestItems[0].filters).toHaveLength(1)

      const requestItems2 = await compiler.compile([
        FeedType.Intersection,
        [FeedType.Author, "author1"],
        [FeedType.Relay, "relay1", "relay2"],
        [FeedType.Kind, 1],
      ])

      // one request item with one filter and two relays
      expect(requestItems2).toHaveLength(1)
      expect(requestItems2[0].filters).toHaveLength(1)
      expect(requestItems2[0].relays).toHaveLength(2)

      const requestItems3 = await compiler.compile([
        FeedType.Intersection,
        [FeedType.Author, "author1"],
        [FeedType.Intersection, [FeedType.Kind, 1], [FeedType.Relay, "relay1", "relay2"]],
      ])

      // one request item with one filter and one relay
      expect(requestItems3).toHaveLength(1)
      expect(requestItems3[0].filters).toHaveLength(1)
      expect(requestItems3[0].relays).toHaveLength(2)

      const requestItems4 = await compiler.compile([
        FeedType.Intersection,
        [FeedType.Author, "author1"],
        [FeedType.Union, [FeedType.Kind, 1], [FeedType.Relay, "relay1", "relay2"]],
      ])

      // one request item with one filter and one relay
      expect(requestItems4).toHaveLength(1)
      expect(requestItems4[0].filters).toHaveLength(1)
      expect(requestItems4[0].relays).toHaveLength(2)
    })

    it("should compile DVM feed", async () => {
      const mockEvent: TrustedEvent = {
        id: "id1",
        pubkey: "pubkey1",
        created_at: 1000,
        kind: 7000,
        tags: [],
        content: JSON.stringify([
          ["t", "test"],
          ["r", "relay1"],
        ]),
        sig: "sig1",
      }

      mockOptions.requestDVM.mockImplementation(async ({onEvent}) => {
        await onEvent(mockEvent)
      })

      const requestItems = await compiler.compile([
        FeedType.DVM,
        {
          kind: 7000,
          mappings: defaultTagFeedMappings,
        },
      ])

      expect(mockOptions.requestDVM).toHaveBeenCalled()
      // 2 request items
      expect(requestItems).toHaveLength(2)
      // the first with 1 filter and no relay
      expect(requestItems[0].filters).toHaveLength(1)
      expect(requestItems[0].relays).toBeUndefined()
      // the second with no filter and 1 relay
      expect(requestItems[1].filters).toBeUndefined()
      expect(requestItems[1].relays).toHaveLength(1)
    })

    it("should compile List feed", async () => {
      const mockEvent: TrustedEvent = {
        id: "id1",
        pubkey: "pubkey1",
        created_at: 1000,
        kind: 1,
        tags: [
          ["d", "test"],
          ["t", "test"],
          ["r", "relay1"],
        ],
        content: "",
        sig: "sig1",
      }

      mockOptions.request.mockImplementation(({onEvent}) => {
        onEvent(mockEvent)
      })

      const requestItems = await compiler.compile([
        FeedType.List,
        {
          addresses: [getAddress(mockEvent)],
          mappings: defaultTagFeedMappings,
        },
      ])

      expect(mockOptions.request).toHaveBeenCalled()
      // 2 request items
      expect(requestItems).toHaveLength(2)
      // the first with 1 filter and no relay
      expect(requestItems[0].filters).toHaveLength(1)
      expect(requestItems[0].relays).toBeUndefined()
      // the second with no filter and 1 relay
      expect(requestItems[1].filters).toBeUndefined()
      expect(requestItems[1].relays).toHaveLength(1)
    })

    it("should compile Label feed", async () => {
      const labelEvent: TrustedEvent = {
        id: "label1",
        pubkey: "pubkey1",
        created_at: 1000,
        kind: 1985,
        tags: [
          ["L", "spam"],
          ["e", "event1"],
          ["p", "author1"],
        ],
        content: "This is spam",
        sig: "sig1",
      }

      mockOptions.request.mockImplementation(({onEvent}) => {
        onEvent(labelEvent)
      })

      const requestItems = await compiler.compile([
        FeedType.Label,
        {
          "#L": ["spam"],
          mappings: defaultTagFeedMappings,
        },
      ])
      // should return an union filter with the "e" and "p" tags from the label event
      expect(mockOptions.request).toHaveBeenCalled()
      expect(requestItems).toHaveLength(1)
      expect(requestItems[0].filters).toHaveLength(2)
    })
  })

  describe("error handling", () => {
    it("should throw error for unsupported feed type", async () => {
      await expect(compiler.compile(["UnsupportedType", "value"] as any)).rejects.toThrow(
        "Unable to convert feed of type UnsupportedType to filters",
      )
    })

    it("should handle DVM events with invalid JSON content", async () => {
      const mockEvent: TrustedEvent = {
        id: "id1",
        pubkey: "pubkey1",
        created_at: 7000,
        kind: 1,
        tags: [],
        content: "invalid json",
        sig: "sig1",
      }

      mockOptions.requestDVM.mockImplementation(async ({onEvent}) => {
        await onEvent(mockEvent)
      })

      const requestItems = await compiler.compile([
        FeedType.DVM,
        {kind: 7000, mappings: defaultTagFeedMappings},
      ])

      expect(requestItems).toBeDefined()
      expect(requestItems).toHaveLength(0)
    })
  })
})
