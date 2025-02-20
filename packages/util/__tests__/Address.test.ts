import {describe, it, expect} from "vitest"
import {decode, naddrEncode} from "nostr-tools/nip19"
import {Address, getAddress} from "../src/Address"

describe("Address", () => {
  const pub = "ee".repeat(32)
  const identifier = "identifier"

  describe("constructor", () => {
    it("should create an Address instance with required properties", () => {
      const address = new Address(1, pub, identifier)

      expect(address.kind).toBe(1)
      expect(address.pubkey).toBe(pub)
      expect(address.identifier).toBe(identifier)
      expect(address.relays).toEqual([])
    })

    it("should create an Address instance with optional relays", () => {
      const relays = ["wss://relay1.com", "wss://relay2.com"]
      const address = new Address(1, pub, identifier, relays)

      expect(address.relays).toEqual(relays)
    })
  })

  describe("isAddress", () => {
    it("should return true for valid address strings", () => {
      expect(Address.isAddress(`1:${pub}:${identifier}`)).toBe(true)
      expect(Address.isAddress("30023:abc123:test")).toBe(true)
      expect(Address.isAddress("0:xyz789:")).toBe(true)
    })

    it("should return false for invalid address strings", () => {
      expect(Address.isAddress("invalid")).toBe(false)
      expect(Address.isAddress(`1:${pub}`)).toBe(false)
      expect(Address.isAddress(`:${pub}:${identifier}`)).toBe(false)
      expect(Address.isAddress(`abc:${pub}:${identifier}`)).toBe(false)
    })
  })

  describe("from", () => {
    it("should create an Address from a valid address string", () => {
      const address = Address.from(`1:${pub}:${identifier}`)

      expect(address.kind).toBe(1)
      expect(address.pubkey).toBe(pub)
      expect(address.identifier).toBe(identifier)
    })

    it("should handle address strings without identifier", () => {
      const address = Address.from(`1:${pub}:`)

      expect(address.identifier).toBe("")
    })

    it("should accept optional relays", () => {
      const relays = ["wss://relay1.com"]
      const address = Address.from(`1:${pub}:${identifier}`, relays)

      expect(address.relays).toEqual(relays)
    })
  })

  describe("fromNaddr", () => {
    it("should create an Address from a valid naddr", () => {
      // Create a valid naddr using nostr-tools encode
      const data = {
        type: "naddr",
        data: {
          kind: 1,
          pubkey: pub,
          identifier: identifier,
          relays: ["wss://relay1.com"],
        },
      }
      const naddr = naddrEncode(data.data)

      const address = Address.fromNaddr(naddr)

      expect(address.kind).toBe(1)
      expect(address.pubkey).toBe(pub)
      expect(address.identifier).toBe(identifier)
      expect(address.relays).toEqual(["wss://relay1.com"])
    })

    it("should throw error for invalid naddr", () => {
      expect(() => Address.fromNaddr("invalid")).toThrow("Invalid naddr invalid")
      expect(() => Address.fromNaddr("nostr:123")).toThrow("Invalid naddr nostr:123")
    })
  })

  describe("fromEvent", () => {
    it("should create an Address from an event with d tag", () => {
      const event = {
        kind: 1,
        pubkey: pub,
        tags: [["d", identifier]],
      }

      const address = Address.fromEvent(event)

      expect(address.kind).toBe(1)
      expect(address.pubkey).toBe(pub)
      expect(address.identifier).toBe(identifier)
    })

    it("should create an Address from an event without d tag", () => {
      const event = {
        kind: 1,
        pubkey: pub,
        tags: [],
      }

      const address = Address.fromEvent(event)

      expect(address.identifier).toBe("")
    })

    it("should accept optional relays", () => {
      const event = {
        kind: 1,
        pubkey: pub,
        tags: [["d", identifier]],
      }
      const relays = ["wss://relay1.com"]

      const address = Address.fromEvent(event, relays)

      expect(address.relays).toEqual(relays)
    })
  })

  describe("toString", () => {
    it("should convert Address to string format", () => {
      const address = new Address(1, pub, identifier)

      expect(address.toString()).toBe(`1:${pub}:${identifier}`)
    })

    it("should handle empty identifier", () => {
      const address = new Address(1, pub, "")

      expect(address.toString()).toBe(`1:${pub}:`)
    })
  })

  describe("toNaddr", () => {
    it("should convert Address to naddr format", () => {
      const address = new Address(1, pub, identifier, ["wss://relay1.com"])

      const naddr = address.toNaddr()

      // Decode the naddr to verify its contents
      const decoded = decode(naddr)
      expect(decoded.type).toBe("naddr")
      expect(decoded.data.kind).toBe(1)
      expect(decoded.data.pubkey).toBe(pub)
      expect(decoded.data.identifier).toBe(identifier)
      expect(decoded.data.relays).toEqual(["wss://relay1.com"])
    })
  })

  describe("getAddress utility", () => {
    it("should get address string from event", () => {
      const event = {
        kind: 1,
        pubkey: pub,
        tags: [["d", identifier]],
      }

      expect(getAddress(event)).toBe(`1:${pub}:${identifier}`)
    })

    it("should handle event without d tag", () => {
      const event = {
        kind: 1,
        pubkey: pub,
        tags: [],
      }

      expect(getAddress(event)).toBe(`1:${pub}:`)
    })
  })

  describe("edge cases", () => {
    it("should handle numeric pubkeys", () => {
      const address = Address.from("1:123:test")
      expect(address.pubkey).toBe("123")
    })

    it("should handle special characters in identifier", () => {
      const address = Address.from("1:abc:test-123_456")
      expect(address.identifier).toBe("test-123_456")
    })

    it("should handle zero kind", () => {
      const address = Address.from("0:abc:test")
      expect(address.kind).toBe(0)
    })
  })
})
