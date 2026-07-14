import {describe, it, expect} from "vitest"
import {makeSecret, DELETE, NOTE, LONG_FORM} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {Delete} from "../src/kinds/Delete"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const eventId = "11".repeat(32)
const address = `30023:${"22".repeat(32)}:article`

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: DELETE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("Delete", () => {
  it("reads ids, addresses, kinds, and reason", async () => {
    const reader = await read(
      Delete,
      makeEvent({
        content: "posted by mistake",
        tags: [
          ["e", eventId],
          ["e", eventId],
          ["a", address],
          ["k", "1"],
          ["k", "30023"],
          ["k", "1"],
          ["alt", "x"],
        ],
      }),
    )

    expect(reader.ids()).toEqual([eventId])
    expect(reader.addresses()).toEqual([address])
    expect(reader.kinds()).toEqual([1, 30023])
    expect(reader.reason()).toBe("posted by mistake")
  })

  it("round-trips without duplicating represented tags", async () => {
    const reader = await read(
      Delete,
      makeEvent({
        content: "posted by mistake",
        tags: [
          ["e", eventId],
          ["a", address],
          ["k", "1"],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(write(Delete, reader), signer)

    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "k").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("posted by mistake")
  })

  it("adds e and k tags for a regular target", async () => {
    const target = makeEvent({id: eventId, kind: NOTE})

    const tmpl = await buildTemplate(write(Delete).addEvent(target), signer)

    expect(tmpl.kind).toBe(DELETE)
    expect(tmpl.tags).toContainEqual(["e", eventId, ""])
    expect(tmpl.tags).toContainEqual(["k", "1"])
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([])
  })

  it("adds an a tag for a replaceable target", async () => {
    const target = makeEvent({
      id: eventId,
      pubkey: "22".repeat(32),
      kind: LONG_FORM,
      tags: [["d", "article"]],
    })

    const tmpl = await buildTemplate(write(Delete).addEvent(target), signer)

    expect(tmpl.tags).toContainEqual(["e", eventId, ""])
    expect(tmpl.tags).toContainEqual(["k", "30023"])
    expect(tmpl.tags).toContainEqual(["a", address, ""])
  })

  it("sets a reason", async () => {
    const target = makeEvent({id: eventId, kind: NOTE})

    const tmpl = await buildTemplate(
      write(Delete).addEvent(target).setReason("posted by mistake"),
      signer,
    )

    expect(tmpl.content).toBe("posted by mistake")
  })

  it("throws without an e or a tag", async () => {
    await expect(buildTemplate(write(Delete).setReason("oops"), signer)).rejects.toThrow(
      "A delete must reference at least one event via an e or a tag",
    )
  })

  it("throws on the wrong kind", async () => {
    await expect(read(Delete, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
