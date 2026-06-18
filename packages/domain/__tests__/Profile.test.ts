import {describe, it, expect} from "vitest"
import {makeSecret, PROFILE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Profile, displayPubkey} from "../src/Profile"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: PROFILE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("Profile", () => {
  it("parses and re-signs profile content", async () => {
    const event = makeEvent({
      content: JSON.stringify({name: "alice", about: "hi"}),
      tags: [["alt", "profile"]],
    })

    const profile = Profile.parse(event)

    expect(profile.values.name).toBe("alice")
    expect(profile.hasName()).toBe(true)
    expect(profile.display()).toBe("alice")

    const signed = await profile.toEvent(signer)

    expect(signed.kind).toBe(PROFILE)
    expect(JSON.parse(signed.content).name).toBe("alice")
    // Source tags are preserved.
    expect(signed.tags).toEqual([["alt", "profile"]])
  })

  it("derives lnurl from a lud16 address", () => {
    const profile = Profile.make({lud16: "alice@example.com"})

    expect(profile.values.lnurl).toBeTruthy()
  })

  it("set merges and re-derives values", () => {
    const profile = Profile.make({name: "alice"})

    profile.set({about: "hello"})

    expect(profile.values.name).toBe("alice")
    expect(profile.values.about).toBe("hello")
  })

  it("display falls back to a shortened npub", () => {
    const profile = Profile.parse(makeEvent({content: "{}"}))

    expect(profile.display()).toBe(displayPubkey(pubkey))
  })

  it("serializes to JSON", () => {
    const profile = Profile.make({name: "alice"})

    expect(JSON.parse(JSON.stringify(profile))).toEqual({name: "alice"})
  })

  it("throws on the wrong kind", () => {
    expect(() => Profile.parse(makeEvent({kind: NOTE}))).toThrow()
  })
})
