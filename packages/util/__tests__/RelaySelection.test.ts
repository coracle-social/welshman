import {describe, it, expect} from "vitest"
import {inbox, outbox, userOutbox, relay, indexers, Resolver} from "../src/RelaySelection"
import type {RelayRoute} from "../src/RelaySelection"

const R1 = "wss://one.example.com/"
const R2 = "wss://two.example.com/"
const R3 = "wss://three.example.com/"

// A synchronous stand-in for the app's route resolver.
const resolver = (route: RelayRoute): string[] => {
  switch (route.type) {
    case "userOutbox":
      return [R1]
    case "pubkeyInbox":
      return [R2]
    case "pubkeyOutbox":
      return [R1]
    case "relay":
      return [route.url]
    case "index":
      return [R3]
    default:
      return []
  }
}

describe("RelaySelection constructors", () => {
  it("encode route and weight", () => {
    expect(inbox("a", 0.5)).toEqual({route: {type: "pubkeyInbox", pubkey: "a"}, weight: 0.5})
    expect(outbox("a")).toEqual({route: {type: "pubkeyOutbox", pubkey: "a"}, weight: 1})
    expect(userOutbox()).toEqual({route: {type: "userOutbox"}, weight: 1})
    expect(relay(R1)).toEqual({route: {type: "relay", url: R1}, weight: 1})
    expect(indexers()).toEqual({route: {type: "index"}, weight: 1})
  })
})

describe("Resolver", () => {
  it("resolves routes and deduplicates urls into a scenario", async () => {
    const scenario = await new Resolver(resolver).scenario([userOutbox(), inbox("a"), indexers()])

    // author -> R1, inbox(read) -> R2, index -> R3
    expect(scenario.getUrls().sort()).toEqual([R1, R2, R3].sort())
  })

  it("supports async route resolvers", async () => {
    const scenario = await new Resolver(async route =>
      route.type === "relay" ? [route.url] : [],
    ).scenario([relay(R1)])

    expect(scenario.getUrls()).toEqual([R1])
  })

  it("honors a caller-set limit", async () => {
    const scenario = await new Resolver(resolver).scenario([relay(R1), relay(R2), relay(R3)])

    expect(scenario.limit(2).getUrls().length).toBe(2)
  })

  it("drops non-relay urls", async () => {
    const scenario = await new Resolver(resolver).scenario([relay("not-a-relay")])

    expect(scenario.getUrls()).toEqual([])
  })

  it("relays() and relay() read urls off the scenario", async () => {
    const res = new Resolver(resolver)

    expect(await res.relays([outbox("a")])).toEqual([R1])
    expect(await res.relay([outbox("a")])).toBe(R1)
  })
})
