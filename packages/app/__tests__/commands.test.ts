import {ctx} from "@welshman/lib"
import {FOLLOWS, MUTES, PINS} from "@welshman/util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {follow, mute, pin, unfollow, unmute, unpin} from "../src/commands"
import * as thunkModule from "../src/thunk"
import {thunkWorker} from "../src/thunk"
import {repository} from "../src/core"

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
    net: {
      getExecutor: vi.fn(),
      optimizeSubscriptions: vi.fn().mockReturnValue([]),
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
  const pubkey1 = "aa".repeat(32)
  const pubkey2 = "bb".repeat(32)

  const event1 = "ee".repeat(32)
  const event2 = "ff".repeat(32)

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date())
    vi.resetModules()
    vi.clearAllMocks()

    repository.load([])
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()

    thunkWorker.clear()
    thunkWorker.pause()
    thunkWorker.resume()
  })

  describe("follow commands", () => {
    it("should create new follows list if none exists", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")
      await follow(["p", pubkey1])
      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: FOLLOWS,
            tags: expect.arrayContaining([["p", pubkey1]]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should use existing follows list if available", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await follow(["p", pubkey1])

      await vi.runAllTimersAsync()

      await follow(["p", pubkey2])

      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: FOLLOWS,
            tags: expect.arrayContaining([
              ["p", pubkey1],
              ["p", pubkey2],
            ]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should handle unfollow command", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await follow(["p", pubkey1])

      await vi.runAllTimersAsync()

      await unfollow(pubkey1)

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: FOLLOWS,
            tags: expect.arrayContaining([]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })
  })

  describe("mute commands", () => {
    it("should create new mutes list if none exists", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await mute(["p", pubkey1])

      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith({
        event: expect.objectContaining({
          kind: MUTES,
          tags: expect.arrayContaining([["p", pubkey1]]),
        }),
        relays: ["relay1", "relay2"],
      })
    })

    it.skip("should use existing mutes list if available", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await mute(["p", pubkey1])

      await vi.runAllTimersAsync()

      await mute(["p", pubkey2])

      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: MUTES,
            tags: expect.arrayContaining([
              ["p", pubkey1],
              ["p", pubkey2],
            ]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should handle unmute command", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await mute(["p", pubkey1])

      await vi.runAllTimersAsync()

      await unmute("pubkey1")

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: MUTES,
            tags: expect.arrayContaining([]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })
  })

  describe("pin commands", () => {
    it("should create new pins list if none exists", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")
      await pin(["e", event1])

      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: PINS,
            tags: expect.arrayContaining([["e", event1]]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it.skip("should use existing pins list if available", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await pin(["e", event1])

      await vi.runAllTimersAsync()

      await pin(["e", event2])

      await vi.runAllTimersAsync()

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: PINS,
            tags: expect.arrayContaining([
              ["e", event1],
              ["e", event2],
            ]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })

    it("should handle unpin command", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")

      await pin(["e", event1])

      await vi.runAllTimersAsync()

      await unpin("event1")

      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            kind: PINS,
            tags: expect.arrayContaining([]),
          }),
          relays: ["relay1", "relay2"],
        }),
      )
    })
  })

  describe("relay selection", () => {
    it("should use correct relays from router", async () => {
      const publishThunkSpy = vi.spyOn(thunkModule, "publishThunk")
      const mockGetUrls = vi.fn().mockReturnValue(["relay3", "relay4"])
      vi.mocked(ctx.app.router.FromUser).mockReturnValue({
        getUrls: mockGetUrls,
      })

      await follow(["p", pubkey1])

      expect(ctx.app.router.FromUser).toHaveBeenCalled()
      expect(mockGetUrls).toHaveBeenCalled()
      expect(publishThunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          relays: ["relay3", "relay4"],
        }),
      )
    })
  })
})
