import {describe, it, expect} from "vitest"
import {Relay} from "../src/other/Relay"

describe("Relay", () => {
  describe("constructor", () => {
    it("forces the url and copies known fields", () => {
      const relay = new Relay("wss://relay.example/", {name: "Example", negentropy: 1})

      expect(relay.url).toBe("wss://relay.example/")
      expect(relay.name).toBe("Example")
      expect(relay.negentropy).toBe(1)
    })

    it("coerces supported_nips to strings", () => {
      const relay = new Relay("wss://r/", {supported_nips: [1, 50, "77"] as any})

      expect(relay.supported_nips).toEqual(["1", "50", "77"])
    })

    it("defaults supported_nips to [] when missing or not an array", () => {
      expect(new Relay("wss://r/").supported_nips).toEqual([])
      expect(new Relay("wss://r/", {supported_nips: "nope" as any}).supported_nips).toEqual([])
    })
  })

  describe("display", () => {
    it("reduces the url to host/path", () => {
      expect(new Relay("wss://relay.example/").displayUrl()).toBe("relay.example")
    })

    it("prefers the name, falling back to the display url", () => {
      expect(new Relay("wss://relay.example/", {name: "Nos"}).display()).toBe("Nos")
      expect(new Relay("wss://relay.example/").display()).toBe("relay.example")
      expect(new Relay("wss://relay.example/").display("custom")).toBe("custom")
    })
  })

  describe("hasNegentropy", () => {
    it("is true when the negentropy field is set", () => {
      expect(new Relay("wss://r/", {negentropy: 1}).hasNegentropy()).toBe(true)
    })

    it("is true when NIP-77 is advertised", () => {
      expect(new Relay("wss://r/", {supported_nips: ["77"]}).hasNegentropy()).toBe(true)
    })

    it("is true for a modern strfry relay", () => {
      expect(new Relay("wss://r/", {software: "git+strfry", version: "1.0"}).hasNegentropy()).toBe(
        true,
      )
    })

    it("is false for strfry 0.x and for plain relays", () => {
      expect(new Relay("wss://r/", {software: "strfry", version: "0.9"}).hasNegentropy()).toBe(
        false,
      )
      expect(new Relay("wss://r/").hasNegentropy()).toBe(false)
    })
  })

  describe("hasNip", () => {
    it("checks supported_nips (number or string)", () => {
      const relay = new Relay("wss://r/", {supported_nips: [1, 50] as any})

      expect(relay.hasNip(50)).toBe(true)
      expect(relay.hasNip("1")).toBe(true)
      expect(relay.hasNip(9999)).toBe(false)
    })
  })
})
