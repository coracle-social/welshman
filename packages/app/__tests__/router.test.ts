import {ctx, now} from "@welshman/lib"
import {COMMENT, PROFILE, RELAYS, TrustedEvent} from "@welshman/util"
import {beforeEach, describe, expect, it, vi} from "vitest"
import {relaysByUrl} from "../src/relays"
import {relaySelectionsByPubkey} from "../src/relaySelections"
import {
  RelayMode,
  Router,
  addMaximalFallbacks,
  addMinimalFallbacks,
  addNoFallbacks,
  getFilterSelections,
  getPubkeyRelays,
  getRelayQuality,
  makeRouter,
} from "../src/router"

// Mock dependencies
vi.mock(import("@welshman/lib"), async imports => ({
  ...(await imports()),
  ctx: {
    net: {
      pool: {
        has: vi.fn(),
      },
    },
    app: {
      indexerRelays: ["wss://indexer1.com", "wss://indexer2.com"],
    },
  },
}))

vi.mock(import("../src/relays"), async imports => ({
  ...(await imports()),
  relaysByUrl: {
    get: vi.fn(),
  },
}))

vi.mock(import("../src/relaySelections"), async imports => ({
  ...(await imports()),
  relaySelectionsByPubkey: {
    get: vi.fn().mockReturnValue(new Map()),
  },
  inboxRelaySelectionsByPubkey: {
    get: vi.fn().mockReturnValue(new Map()),
  },
}))

describe("Router", () => {
  const id = "00".repeat(32)
  const pubkey = "aa".repeat(32)
  const pubkey1 = "bb".repeat(32)
  const pubkey2 = "cc".repeat(32)
  let router: Router
  const mockEvent: TrustedEvent = {
    id,
    pubkey,
    created_at: now(),
    kind: COMMENT,
    tags: [
      ["E", "11".repeat(32), "wss://relay.com", pubkey1],
      ["P", pubkey2, "wss://relay2.com"],
    ],
    content: "test content",
    sig: "test-sig",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    router = makeRouter({
      getUserPubkey: () => pubkey,
      getPubkeyRelays: (user: string, mode?: RelayMode) => [`wss://${mode}.${user.slice(-4)}.com`],
      getFallbackRelays: () => ["wss://fallback1.com", "wss://fallback2.com"],
      getRelayQuality: () => 1,
      getLimit: () => 2,
    })
    ctx.app.router = router
  })

  describe("Basic Router Functions", () => {
    it("should create router with default options", () => {
      const router = makeRouter()
      expect(router).toBeInstanceOf(Router)
    })

    it("should respect limit option", () => {
      const urls = router.FromRelays(["wss://1.com", "wss://2.com", "wss://3.com"]).getUrls()
      expect(urls).toHaveLength(2)
    })

    it("should filter invalid relay URLs", () => {
      const urls = router.FromRelays(["invalid", "wss://valid.com"]).getUrls()
      expect(urls).toHaveLength(2)
      // invalid should be filtered out
      expect(urls.includes("invalid")).toBe(false)
      // one of the relay should be a fallback
      expect(urls.some(url => url.startsWith("wss://fallback"))).toBe(true)
      expect(urls[0]).toBe("wss://valid.com/")
    })
  })

  describe("Fallback Policies", () => {
    it("should implement no fallbacks policy", () => {
      expect(addNoFallbacks(1, 3)).toBe(0)
      expect(addNoFallbacks(0, 3)).toBe(0)
    })

    it("should implement minimal fallbacks policy", () => {
      expect(addMinimalFallbacks(1, 3)).toBe(0)
      expect(addMinimalFallbacks(0, 3)).toBe(1)
    })

    it("should implement maximal fallbacks policy", () => {
      expect(addMaximalFallbacks(1, 3)).toBe(2)
      expect(addMaximalFallbacks(0, 3)).toBe(3)
    })
  })

  describe("RouterScenario", () => {
    it("should apply weight to selections", () => {
      const scenario = router.FromRelays(["wss://1.com", "wss://2.com"]).weight(0.5)

      expect(scenario.selections[0].weight).toBe(0.5)
    })

    it("should merge scenarios", () => {
      const scenario1 = router.FromRelays(["wss://1.com"])
      const scenario2 = router.FromRelays(["wss://2.com"])
      const merged = router.merge([scenario1, scenario2])

      expect(merged.selections).toHaveLength(2)
    })

    it("should respect security options", () => {
      const urls = router
        .FromRelays(["ws://insecure.com", "wss://secure.com"])
        .allowInsecure(false)
        .getUrls()

      expect(urls).toContain("wss://secure.com/")
      expect(urls).not.toContain("ws://insecure.com/")
    })
  })

  describe("Routing Scenarios", () => {
    describe("ForUser/FromUser", () => {
      it("should handle user routing", () => {
        const readUrls = router.ForUser().getUrls()
        const writeUrls = router.FromUser().getUrls()

        expect(readUrls).toContain(`wss://read.${pubkey.slice(-4)}.com/`)
        expect(writeUrls).toContain(`wss://write.${pubkey.slice(-4)}.com/`)
      })
    })

    describe("Event Routing", () => {
      it("should route for event author", () => {
        const urls = router.Event(mockEvent).getUrls()
        expect(urls[0]).toBe(`wss://write.${mockEvent.pubkey.slice(-4)}.com/`)
        expect(urls.length).toBeGreaterThan(0)
      })

      it("should handle event replies", () => {
        const urls = router.Replies(mockEvent).getUrls()
        expect(urls[0]).toBe(`wss://read.${mockEvent.pubkey.slice(-4)}.com/`)
        expect(urls.length).toBeGreaterThan(0)
      })

      it("should handle event ancestors", () => {
        const urls = router.EventRoots(mockEvent).getUrls()
        // should have the relay of the mention and the relay of the parent
        expect(urls.length).toBe(2)
        // @check, super random results
        // expect(urls).contains("wss://relay.com/")
        // expect(urls).contains("wss://relay2.com/")
      })
    })

    describe("Pubkey Routing", () => {
      it("should route for single pubkey", () => {
        const urls = router.ForPubkey("test-pubkey").getUrls()
        expect(urls.length).toBeGreaterThan(0)
      })

      it("should route for multiple pubkeys", () => {
        const urls = router.ForPubkeys(["pubkey1", "pubkey2"]).getUrls()
        expect(urls.length).toBeGreaterThan(0)
      })
    })
  })

  describe("Relay Quality", () => {
    beforeEach(() => {
      vi.mocked(relaysByUrl.get).mockReturnValue(
        new Map([
          [
            "wss://relay.com",
            {
              url: "wss://relay.com",
              stats: {
                recent_errors: [],
              },
            },
          ],
          [
            "wss://error.com",
            {
              url: "wss://error.com",
              stats: {
                recent_errors: [Date.now()],
              },
            },
          ],
        ]),
      )
    })

    it("should score connected relays highly", () => {
      vi.mocked(ctx.net.pool.has).mockReturnValue(true)
      expect(getRelayQuality("wss://relay.com")).toBe(1)
    })

    it("should penalize relays with recent errors", () => {
      expect(getRelayQuality("wss://error.com")).toBe(0)
    })

    it("should handle relays without stats", () => {
      vi.mocked(ctx.net.pool.has).mockReturnValue(false)
      expect(getRelayQuality("wss://new.com")).toBe(0.8)
    })
  })

  describe("Relay Selection", () => {
    beforeEach(() => {
      vi.mocked(relaySelectionsByPubkey.get).mockReturnValue(
        new Map([
          [
            "pubkey1",
            {
              event: {pubkey: "pubkey1"},
              publicTags: [
                ["r", "wss://read.com", "read"],
                ["r", "wss://write.com", "write"],
              ],
            },
          ],
        ]),
      )
    })

    it("should get read relays for pubkey", () => {
      const relays = getPubkeyRelays("pubkey1", RelayMode.Read)
      expect(relays).toContain("wss://read.com/")
    })

    it("should get write relays for pubkey", () => {
      const relays = getPubkeyRelays("pubkey1", RelayMode.Write)
      expect(relays).toContain("wss://write.com/")
    })

    it("should handle missing relay selections", () => {
      const relays = getPubkeyRelays("unknown-pubkey")
      expect(relays).toEqual([])
    })
  })

  describe("Filter Selections", () => {
    it("should handle search filters", () => {
      const selections = getFilterSelections([
        {
          search: "test",
        },
      ])
      expect(selections.length).toBeGreaterThan(0)
    })

    it("should handle author filters", () => {
      const selections = getFilterSelections([
        {
          authors: ["pubkey1", "pubkey2"],
        },
      ])
      expect(selections.length).toBeGreaterThan(0)
    })

    it("should handle indexed kinds", () => {
      const selections = getFilterSelections([
        {
          kinds: [PROFILE, RELAYS],
        },
      ])
      expect(selections.length).toBeGreaterThan(0)
    })
  })
})
