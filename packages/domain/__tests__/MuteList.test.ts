import {describe, it, expect} from "vitest"
import {makeSecret, MUTES, FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {MuteList} from "../src/MuteList"

const signer = new Nip01Signer(makeSecret())

const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)

describe("MuteList", () => {
  it("round-trips public and private mutes through encryption", async () => {
    const list = MuteList.init().addPublicly(a).addPrivately(b)

    expect(list.pubkeys.sort()).toEqual([a, b].sort())
    expect(list.includes(a)).toBe(true)
    expect(list.includes(b)).toBe(true)
    expect(list.includes(c)).toBe(false)

    const event = await list.toEvent(signer)

    expect(event.kind).toBe(MUTES)
    expect(event.sig).toBeTruthy()
    // Public entry is visible in tags; private entry is encrypted in content.
    expect(getPubkeyTagValues(event.tags)).toEqual([a])
    expect(event.content).not.toBe("")

    // Re-parsing with a capable signer recovers the private entries.
    const decrypted = await MuteList.parse(event, signer)

    expect(decrypted.isDecrypted).toBe(true)
    expect(decrypted.pubkeys.sort()).toEqual([a, b].sort())

    // Parsing without a signer exposes only the public entries.
    const publicOnly = await MuteList.parse(event)

    expect(publicOnly.isDecrypted).toBe(false)
    expect(publicOnly.pubkeys).toEqual([a])
  })

  it("removes from both public and private entries", async () => {
    const list = MuteList.init().addPublicly(a).addPrivately(b)

    list.remove(a)
    list.remove(b)

    expect(list.pubkeys).toEqual([])
  })

  it("preserves undecrypted ciphertext on pass-through serialization", async () => {
    const event = await MuteList.init().addPrivately(b).toEvent(signer)
    const undecrypted = await MuteList.parse(event)

    // We never decrypted, so the original ciphertext must survive untouched.
    const template = await undecrypted.toTemplate(signer)

    expect(template.content).toBe(event.content)
  })

  it("refuses private mutation when undecrypted", async () => {
    const event = await MuteList.init().addPrivately(b).toEvent(signer)
    const undecrypted = await MuteList.parse(event)

    expect(() => undecrypted.addPrivately(c)).toThrow()
  })

  it("toRumor encrypts but does not sign", async () => {
    const rumor = await MuteList.init().addPrivately(b).toRumor(signer)

    expect(rumor.id).toBeTruthy()
    expect((rumor as TrustedEvent).sig).toBeUndefined()
    expect(rumor.content).not.toBe("")
  })

  it("throws on the wrong kind", async () => {
    const event = {kind: FOLLOWS, tags: [], content: "", pubkey: a} as TrustedEvent

    await expect(MuteList.parse(event)).rejects.toThrow()
  })
})
