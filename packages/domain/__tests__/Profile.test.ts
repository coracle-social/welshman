import {describe, it, expect} from "vitest"
import {makeSecret, PROFILE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Profile, displayPubkey} from "../src/kinds/Profile"

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

    const profile = await Profile.read(event)

    expect(profile.values.name).toBe("alice")
    expect(profile.name()).toBe("alice")
    expect(profile.display()).toBe("alice")

    const signed = await Profile.builder(profile).toEvent(signer)

    expect(signed.kind).toBe(PROFILE)
    expect(JSON.parse(signed.content).name).toBe("alice")
    // Source tags are preserved.
    expect(signed.tags).toEqual([["alt", "profile"]])
  })

  it("derives lnurl from a lud16 address", async () => {
    const profile = await Profile.read(
      makeEvent({content: JSON.stringify({lud16: "alice@example.com"})}),
    )

    expect(profile.lnurl()).toBeTruthy()
  })

  it("seeds the builder from the reader and edits values", async () => {
    const profile = await Profile.read(makeEvent({content: JSON.stringify({name: "alice"})}))

    const event = await Profile.builder(profile).setAbout("hello").toEvent(signer)
    const updated = await Profile.read(event)

    expect(updated.name()).toBe("alice")
    expect(updated.about()).toBe("hello")
  })

  it("display falls back to a shortened npub", async () => {
    const profile = await Profile.read(makeEvent({content: "{}"}))

    expect(profile.display()).toBe(displayPubkey(pubkey))
  })

  it("throws on the wrong kind", async () => {
    await expect(Profile.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
