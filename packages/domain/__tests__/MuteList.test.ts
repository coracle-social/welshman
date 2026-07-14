import {describe, it, expect} from "vitest"
import {makeSecret, MUTES, FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {MuteList} from "../src/kinds/MuteList"
import {buildTemplate, buildEvent, buildRumor, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())

const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)

describe("MuteList", () => {
  it("round-trips public and private mutes through encryption", async () => {
    const event = await buildEvent(write(MuteList).mutePublicly(a).mutePrivately(b), signer)

    expect(event.kind).toBe(MUTES)
    expect(event.sig).toBeTruthy()
    // Public entry is visible in tags; private entry is encrypted in content.
    expect(getPubkeyTagValues(event.tags)).toEqual([a])
    expect(event.content).not.toBe("")

    // Re-parsing with a capable signer recovers the private entries.
    const decrypted = await read(MuteList, event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.pubkeys().sort()).toEqual([a, b].sort())
    expect(decrypted.includes(a)).toBe(true)
    expect(decrypted.includes(b)).toBe(true)
    expect(decrypted.includes(c)).toBe(false)

    // Parsing without a signer exposes only the public entries.
    const publicOnly = await read(MuteList, event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.pubkeys()).toEqual([a])
  })

  it("removes from both public and private entries", async () => {
    const event = await buildEvent(
      write(MuteList).mutePublicly(a).mutePrivately(b).unmute(a).unmute(b),
      signer,
    )

    const parsed = await read(MuteList, event, signer)

    expect(parsed.pubkeys()).toEqual([])
  })

  it("preserves undecrypted ciphertext on pass-through serialization", async () => {
    const event = await buildEvent(write(MuteList).mutePrivately(b), signer)
    const undecrypted = await read(MuteList, event)

    // We never decrypted, so the original ciphertext must survive untouched.
    const template = await buildTemplate(write(MuteList, undecrypted), signer)

    expect(template.content).toBe(event.content)
  })

  it("refuses private mutation when undecrypted", async () => {
    const event = await buildEvent(write(MuteList).mutePrivately(b), signer)
    const undecrypted = await read(MuteList, event)

    // Mutation is now deferred-validated: adding a private entry to a list we
    // couldn't decrypt throws at emit time, not on the mutating call.
    await expect(
      buildEvent(write(MuteList, undecrypted).mutePrivately(c), signer),
    ).rejects.toThrow()
  })

  it("toRumor encrypts but does not sign", async () => {
    const rumor = await buildRumor(write(MuteList).mutePrivately(b), signer)

    expect(rumor.id).toBeTruthy()
    expect((rumor as TrustedEvent).sig).toBeUndefined()
    expect(rumor.content).not.toBe("")
  })

  it("throws on the wrong kind", async () => {
    const event = {kind: FOLLOWS, tags: [], content: "", pubkey: a} as TrustedEvent

    await expect(read(MuteList, event)).rejects.toThrow()
  })
})
