import {describe, it, expect} from "vitest"
import {makeSecret, PINS, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {PinList, PinListBuilder} from "../src/kinds/PinList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const eventId = "11".repeat(32)
const address = `31890:${"22".repeat(32)}:feed`

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: PINS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("PinList", () => {
  it("reads pinned event ids and addresses", async () => {
    const reader = await PinList.fromEvent(
      makeEvent({tags: [["e", eventId], ["a", address], ["alt", "x"]]}),
    )

    expect(reader.ids()).toEqual([eventId])
    expect(reader.addresses()).toEqual([address])
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await PinList.fromEvent(
      makeEvent({tags: [["e", eventId], ["a", address], ["alt", "x"]]}),
    )

    const tmpl = await reader.builder().toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new PinListBuilder().pinPublicly(["e", eventId]).toTemplate(signer)

    expect(tmpl.kind).toBe(PINS)
    expect(tmpl.tags).toContainEqual(["e", eventId])
  })

  it("round-trips public and private pins through encryption", async () => {
    const event = await new PinListBuilder()
      .pinPublicly(["e", eventId])
      .pinPrivately(["a", address])
      .toEvent(signer)

    const decrypted = await PinList.fromEvent(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.ids()).toEqual([eventId])
    expect(decrypted.addresses()).toEqual([address])

    const publicOnly = await PinList.fromEvent(event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.ids()).toEqual([eventId])
    expect(publicOnly.addresses()).toEqual([])
  })

  it("throws on the wrong kind", async () => {
    await expect(PinList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
