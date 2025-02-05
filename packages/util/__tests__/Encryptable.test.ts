import {MUTES} from "@welshman/util"
import {now} from "@welshman/lib"
import {describe, it, expect, vi, beforeEach} from "vitest"
import {Encryptable, asDecryptedEvent} from "../src/Encryptable"
import type {OwnedEvent, TrustedEvent} from "../src/Events"

describe("Encryptable", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  // Mock encryption function
  const mockEncrypt = vi.fn(async (text: string) => `encrypted:${text}`)

  // Realistic Nostr values
  const pub = "ee".repeat(32)
  const currentTime = now()

  describe("constructor", () => {
    it("should create an instance with minimal event template", () => {
      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const encryptable = new Encryptable(event, {})

      expect(encryptable.event).toBe(event)
      expect(encryptable.updates).toEqual({})
    })

    it("should create an instance with full event template", () => {
      const event: OwnedEvent = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
        content: "original encrypted content",
        tags: [["p", pub]],
      }
      const updates = {
        content: JSON.stringify({list: ["item1", "item2"]}),
        tags: [["p", pub, "wss://relay.example.com"]],
      }
      const encryptable = new Encryptable(event, updates)

      expect(encryptable.event).toBe(event)
      expect(encryptable.updates).toBe(updates)
    })
  })

  describe("reconcile", () => {
    it("should encrypt content updates", async () => {
      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const updates = {
        content: JSON.stringify({muted: [pub]}),
      }
      const encryptable = new Encryptable(event, updates)

      const result = await encryptable.reconcile(mockEncrypt)

      expect(result.content).toBe(`encrypted:${updates.content}`)
      expect(mockEncrypt).toHaveBeenCalledWith(updates.content)
    })

    it("should encrypt tag updates", async () => {
      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const updates = {
        tags: [["p", pub, "wss://relay.example.com"]],
      }
      const encryptable = new Encryptable(event, updates)

      const result = await encryptable.reconcile(mockEncrypt)

      expect(result.tags[0][1]).toBe(`encrypted:${pub}`)
      expect(mockEncrypt).toHaveBeenCalledWith(pub)
    })

    it("should handle both content and tag updates", async () => {
      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const updates = {
        content: JSON.stringify({muted: [pub]}),
        tags: [["p", pub, "wss://relay.example.com"]],
      }
      const encryptable = new Encryptable(event, updates)

      const result = await encryptable.reconcile(mockEncrypt)

      expect(result.content).toBe(`encrypted:${updates.content}`)
      expect(result.tags[0][1]).toBe(`encrypted:${pub}`)
      expect(mockEncrypt).toHaveBeenCalledTimes(2)
    })

    it("should preserve original content when no updates", async () => {
      const event: OwnedEvent = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
        content: JSON.stringify({originalList: [pub]}),
        tags: [],
      }
      const encryptable = new Encryptable(event, {})

      const result = await encryptable.reconcile(mockEncrypt)

      expect(result.content).toBe(event.content)
      expect(mockEncrypt).not.toHaveBeenCalled()
    })

    it("should preserve original tags when no updates", async () => {
      const event: OwnedEvent = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
        content: "",
        tags: [["p", pub, "wss://relay.example.com"]],
      }
      const encryptable = new Encryptable(event, {})

      const result = await encryptable.reconcile(mockEncrypt)

      expect(result.tags).toEqual(event.tags)
      expect(mockEncrypt).not.toHaveBeenCalled()
    })
  })

  describe("asDecryptedEvent", () => {
    it("should create a decrypted event with plaintext", () => {
      const event: TrustedEvent = {
        id: "ff".repeat(32),
        sig: "00".repeat(64),
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
        content: "encrypted content",
        tags: [],
      }
      const plaintext = {
        content: JSON.stringify({muted: [pub]}),
        tags: [["p", pub, "wss://relay.example.com"]],
      }

      const result = asDecryptedEvent(event, plaintext)

      expect(result).toEqual({
        ...event,
        plaintext,
      })
    })

    it("should handle empty plaintext", () => {
      const event: TrustedEvent = {
        id: "ff".repeat(32),
        sig: "00".repeat(64),
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
        content: "encrypted content",
        tags: [],
      }

      const result = asDecryptedEvent(event)

      expect(result).toEqual({
        ...event,
        plaintext: {},
      })
    })
  })

  describe("error handling", () => {
    it("should handle encryption failures", async () => {
      const failingEncrypt = async () => {
        throw new Error("Encryption failed")
      }
      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const updates = {
        content: JSON.stringify({muted: [pub]}),
      }
      const encryptable = new Encryptable(event, updates)

      await expect(encryptable.reconcile(failingEncrypt)).rejects.toThrow("Encryption failed")
    })

    it("should handle partial encryption failures", async () => {
      let callCount = 0
      const partialFailingEncrypt = async () => {
        callCount++
        if (callCount > 1) throw new Error("Encryption failed")
        return "encrypted:success"
      }

      const event: Partial<OwnedEvent> = {
        kind: MUTES,
        pubkey: pub,
        created_at: currentTime,
      }
      const updates = {
        content: JSON.stringify({muted: [pub]}),
        tags: [["p", pub]],
      }
      const encryptable = new Encryptable(event, updates)

      await expect(encryptable.reconcile(partialFailingEncrypt)).rejects.toThrow(
        "Encryption failed",
      )
    })
  })
})
