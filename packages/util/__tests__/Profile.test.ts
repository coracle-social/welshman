import {now} from "@welshman/lib"
import {describe, it, vi, expect, beforeEach} from "vitest"
import {
  makeProfile,
  readProfile,
  createProfile,
  editProfile,
  displayPubkey,
  displayProfile,
  profileHasName,
  isPublishedProfile,
} from "../src/Profile"
import {PROFILE} from "../src/Kinds"
import type {TrustedEvent} from "../src/Events"
import type {Profile, PublishedProfile} from "../src/Profile"

describe("Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Realistic Nostr data
  const pubkey = "ee".repeat(32)
  const id = "ff".repeat(32)
  const sig = "00".repeat(64)
  const currentTime = now()

  const createEvent = (overrides = {}): TrustedEvent => ({
    id: id,
    pubkey: pubkey,
    created_at: currentTime,
    kind: PROFILE,
    tags: [],
    content: "",
    sig: sig,
    ...overrides,
  })

  describe("makeProfile", () => {
    it("should create empty profile", () => {
      const profile = makeProfile()
      expect(profile).toEqual({})
    })

    it("should handle lud06 lightning address", () => {
      const profile = makeProfile({
        lud06:
          "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns",
      })
      expect(profile.lnurl).toBeDefined()
    })

    it("should handle lud16 lightning address", () => {
      const profile = makeProfile({
        lud16: "user@domain.com",
      })
      expect(profile.lnurl).toBeDefined()
    })

    it("should preserve other profile fields", () => {
      const profile = makeProfile({
        name: "Test User",
        about: "Test Bio",
        picture: "https://example.com/pic.jpg",
      })
      expect(profile.name).toBe("Test User")
      expect(profile.about).toBe("Test Bio")
      expect(profile.picture).toBe("https://example.com/pic.jpg")
    })
  })

  describe("readProfile", () => {
    it("should parse valid profile content", () => {
      const event = createEvent({
        content: JSON.stringify({
          name: "Test User",
          about: "Test Bio",
          picture: "https://example.com/pic.jpg",
          lud16: "user@domain.com",
        }),
      })
      const profile = readProfile(event)

      expect(profile.name).toBe("Test User")
      expect(profile.about).toBe("Test Bio")
      expect(profile.picture).toBe("https://example.com/pic.jpg")
      expect(profile.lnurl).toBeDefined()
      expect(profile.event).toBe(event)
    })

    it("should handle invalid JSON content", () => {
      const event = createEvent({
        content: "invalid json",
      })
      const profile = readProfile(event)

      expect(profile.event).toBe(event)
      expect(Object.keys(profile)).not.toContain("name")
    })

    it("should handle empty content", () => {
      const event = createEvent({
        content: "",
      })
      const profile = readProfile(event)

      expect(profile.event).toBe(event)
      expect(Object.keys(profile)).not.toContain("name")
    })
  })

  describe("createProfile", () => {
    it("should create profile event template", () => {
      const profile: Profile = {
        name: "Test User",
        about: "Test Bio",
        picture: "https://example.com/pic.jpg",
        lud16: "user@domain.com",
      }
      const result = createProfile(profile)

      expect(result.kind).toBe(PROFILE)
      expect(JSON.parse(result.content)).toMatchObject({
        name: "Test User",
        about: "Test Bio",
        picture: "https://example.com/pic.jpg",
        lud16: "user@domain.com",
      })
    })

    it("should exclude event field from content", () => {
      const profile: Profile = {
        name: "Test User",
        event: createEvent(),
      }
      const result = createProfile(profile)
      const content = JSON.parse(result.content)

      expect(content).not.toHaveProperty("event")
      expect(content).toHaveProperty("name")
    })
  })

  describe("editProfile", () => {
    it("should create edit event template with existing tags", () => {
      const profile: PublishedProfile = {
        name: "Test User",
        event: createEvent({
          tags: [["p", pubkey]],
        }),
      }
      const result = editProfile(profile)

      expect(result.kind).toBe(PROFILE)
      expect(result.tags).toEqual([["p", pubkey]])
      expect(JSON.parse(result.content)).toMatchObject({
        name: "Test User",
      })
    })
  })

  describe("displayPubkey", () => {
    it("should format pubkey correctly", () => {
      const display = displayPubkey(pubkey)

      expect(display.length).toBe(14) // 8 + 1 + 5 characters
    })
  })

  describe("displayProfile", () => {
    it("should display name if available", () => {
      const profile: Profile = {name: "Test User"}
      expect(displayProfile(profile)).toBe("Test User")
    })

    it("should display display_name if name not available", () => {
      const profile: Profile = {display_name: "Test Display"}
      expect(displayProfile(profile)).toBe("Test Display")
    })

    it("should display pubkey if no names available", () => {
      const profile: Profile = {event: createEvent()}
      expect(displayProfile(profile)).toMatch(/^npub1/)
    })

    it("should display fallback if no profile", () => {
      expect(displayProfile(undefined, "Fallback")).toBe("Fallback")
    })

    it("should truncate long names", () => {
      const longName = "a".repeat(100) + " " + "b".repeat(100)
      const profile: Profile = {name: longName}
      // ellipsize split at space and adds ellipsis to the end of the first part
      expect(displayProfile(profile).length).toBeLessThanOrEqual(103)
    })
  })

  describe("profileHasName", () => {
    it("should return true if profile has name", () => {
      expect(profileHasName({name: "Test"})).toBe(true)
    })

    it("should return true if profile has display_name", () => {
      expect(profileHasName({display_name: "Test"})).toBe(true)
    })

    it("should return false if profile has no names", () => {
      expect(profileHasName({})).toBe(false)
    })

    it("should return false if profile is undefined", () => {
      expect(profileHasName(undefined)).toBe(false)
    })
  })

  describe("isPublishedProfile", () => {
    it("should return true for published profile", () => {
      const profile: PublishedProfile = {
        name: "Test",
        event: createEvent(),
      }
      expect(isPublishedProfile(profile)).toBe(true)
    })

    it("should return false for unpublished profile", () => {
      const profile: Profile = {
        name: "Test",
      }
      expect(isPublishedProfile(profile)).toBe(false)
    })
  })
})
