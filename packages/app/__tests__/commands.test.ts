import {ctx, now} from "@welshman/lib"
import {HashedEvent} from "@welshman/util"
import {get} from "svelte/store"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {follow, mute, pin, unfollow, unmute, unpin} from "../src/commands"
import * as thunkModule from "../src/thunk"
import * as userModule from "../src/user"

vi.mock(import("@welshman/lib"), async importOriginal => ({
  ...(await importOriginal()),
  ctx: {
    app: {
      router: {
        FromUser: vi.fn().mockReturnValue({
          getUrls: vi.fn().mockReturnValue(["relay1", "relay2"]),
        }),
      },
    },
  },
}))

vi.mock(import("../src/session"), async importOriginal => ({
  ...(await importOriginal()),
  nip44EncryptToSelf: vi.fn().mockImplementation(text => `encrypted:${text}`),
  pubkey: {
    get: () => "ee".repeat(32),
    subscribe: run => {
      run("ee".repeat(32))
      return () => null
    },
  },
}))

describe("commands", () => {
  const mockList = {
    id: "ee".repeat(32),
    kind: 0,
    pubkey: "ee".repeat(32),
    created_at: now(),
    content: "",
    tags: [],
    publicTags: [],
  } as HashedEvent

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset mocked store values
  })

  afterEach(() => {
    vi.resetModules()
    vi.useRealTimers()
  })

  describe("follow commands", () => {
    it("should create new follows list if none exists", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")
      await follow(["p", "pubkey1"])

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            tags: expect.arrayContaining([["p", "pubkey1"]]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should use existing follows list if available", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await follow(["p", "pubkey1"])

      await vi.runAllTimersAsync()

      await follow(["p", "pubkey2"])

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            tags: expect.arrayContaining([
              ["p", "pubkey1"],
              ["p", "pubkey2"],
            ]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should handle unfollow command", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await unfollow("pubkey1")

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            tags: expect.arrayContaining([]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })
  })

  describe("mute commands", () => {
    it("should create new mutes list if none exists", async () => {
      const result = await mute(["p", "pubkey1"])

      expect(get).toHaveBeenCalledWith(userModule.userMutes)
      expect(vi.mocked(thunkModule.publishThunk)).toHaveBeenCalledWith({
        event: "mock-reconciled-event",
        relays: ["relay1", "relay2"],
      })
    })

    it("should use existing mutes list if available", async () => {
      vi.mocked(get).mockReturnValueOnce(mockList)

      await mute(["p", "pubkey1"])

      expect(mockList.reconcile).toHaveBeenCalled()
    })

    it("should handle unmute command", async () => {
      vi.mocked(get).mockReturnValueOnce(mockList)

      await unmute("pubkey1")

      expect(mockList.reconcile).toHaveBeenCalled()
      expect(vi.mocked(thunkModule.publishThunk)).toHaveBeenCalledWith({
        event: "mock-reconciled-event",
        relays: ["relay1", "relay2"],
      })
    })
  })

  describe("pin commands", () => {
    it("should create new pins list if none exists", async () => {
      const result = await pin(["e", "event1"])

      expect(get).toHaveBeenCalledWith(userModule.userPins)
      expect(vi.mocked(thunkModule.publishThunk)).toHaveBeenCalledWith({
        event: "mock-reconciled-event",
        relays: ["relay1", "relay2"],
      })
    })

    it("should use existing pins list if available", async () => {
      vi.mocked(get).mockReturnValueOnce(mockList)

      await pin(["e", "event1"])

      expect(mockList.reconcile).toHaveBeenCalled()
    })

    it("should handle unpin command", async () => {
      vi.mocked(get).mockReturnValueOnce(mockList)

      await unpin("event1")

      expect(mockList.reconcile).toHaveBeenCalled()
      expect(vi.mocked(thunkModule.publishThunk)).toHaveBeenCalledWith({
        event: "mock-reconciled-event",
        relays: ["relay1", "relay2"],
      })
    })
  })

  describe("error handling", () => {
    it("should handle encryption failures", async () => {
      await expect(follow(["p", "pubkey1"])).rejects.toThrow("Encryption failed")
    })

    it("should handle publish failures", async () => {
      vi.mocked(thunkModule.publishThunk).mockRejectedValueOnce(new Error("Publish failed"))

      await expect(follow(["p", "pubkey1"])).rejects.toThrow("Publish failed")
    })
  })

  describe("relay selection", () => {
    it("should use correct relays from router", async () => {
      const mockGetUrls = vi.fn().mockReturnValue(["relay3", "relay4"])
      vi.mocked(ctx.app.router.FromUser).mockReturnValue({
        getUrls: mockGetUrls,
      })

      await follow(["p", "pubkey1"])

      expect(ctx.app.router.FromUser).toHaveBeenCalled()
      expect(mockGetUrls).toHaveBeenCalled()
      expect(vi.mocked(thunkModule.publishThunk)).toHaveBeenCalledWith({
        event: "mock-reconciled-event",
        relays: ["relay3", "relay4"],
      })
    })
  })

  describe("list creation", () => {
    // it("should create follows list with correct kind", async () => {
    //   await follow(["p", "pubkey1"])
    //   expect(vi.mocked(get).mock.results[0].value).toBeNull()
    //   // Could add more specific checks about list creation if needed
    // })
    // it("should create mutes list with correct kind", async () => {
    //   await mute(["p", "pubkey1"])
    //   expect(vi.mocked(get).mock.results[0].value).toBeNull()
    // })
    // it("should create pins list with correct kind", async () => {
    //   await pin(["e", "event1"])
    //   expect(vi.mocked(get).mock.results[0].value).toBeNull()
    // })
  })
})
