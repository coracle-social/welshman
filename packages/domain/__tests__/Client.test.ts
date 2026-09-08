import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getClient} from "../src/behaviors/Client"
import {Note} from "../src/kinds/Note"
import {buildTemplate, markerResolver, read, write, PUBKEY_OUTBOX} from "./helpers.js"

const HANDLER = "bb".repeat(32)
const ADDRESS = `31990:${HANDLER}:coracle`

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "aa".repeat(32),
    created_at: 0,
    kind: NOTE,
    tags,
    content: "hi",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("getClient", () => {
  it("parses a name, handler address, and relay hint", () => {
    expect(getClient(makeEvent([["client", "Coracle", ADDRESS, "wss://relay.test"]]))).toEqual({
      name: "Coracle",
      address: ADDRESS,
      relay: "wss://relay.test/",
    })
  })

  it("parses a bare name", () => {
    expect(getClient(makeEvent([["client", "Coracle"]]))).toEqual({
      name: "Coracle",
      address: undefined,
      relay: undefined,
    })
  })

  it("drops an address or relay hint that doesn't parse", () => {
    expect(getClient(makeEvent([["client", "Coracle", "not-an-address", "not-a-relay"]]))).toEqual({
      name: "Coracle",
      address: undefined,
      relay: undefined,
    })
  })

  it("returns undefined when the tag is absent or unnamed", () => {
    expect(getClient(makeEvent([["t", "nostr"]]))).toBeUndefined()
    expect(getClient(makeEvent([["client"]]))).toBeUndefined()
    expect(getClient(makeEvent([["client", ""]]))).toBeUndefined()
  })
})

describe("client tags", () => {
  it("reads a client tag off any reader", async () => {
    const reader = await read(Note, makeEvent([["client", "Coracle", ADDRESS]]))

    expect(reader.client()).toEqual({name: "Coracle", address: ADDRESS, relay: undefined})
  })

  it("writes a bare client tag", async () => {
    const tmpl = await buildTemplate(write(Note).setClient("Coracle"))

    expect(tmpl.tags).toEqual([["client", "Coracle"]])
  })

  it("resolves the handler author's outbox into the relay hint slot", async () => {
    const tmpl = await buildTemplate(
      write(Note, undefined, markerResolver).setClient("Coracle", ADDRESS),
    )

    expect(tmpl.tags).toEqual([["client", "Coracle", ADDRESS, PUBKEY_OUTBOX]])
  })

  it("leaves the hint empty for an address that isn't a handler pointer", async () => {
    const tmpl = await buildTemplate(
      write(Note, undefined, markerResolver).setClient("Coracle", "garbage"),
    )

    expect(tmpl.tags).toEqual([["client", "Coracle", "garbage"]])
  })

  it("round-trips a client tag through an edit", async () => {
    const reader = await read(Note, makeEvent([["client", "Coracle"]]))
    const tmpl = await buildTemplate(write(Note, reader).setContent("edited"))

    expect(tmpl.content).toBe("edited")
    expect(tmpl.tags).toEqual([["client", "Coracle"]])
  })

  it("replaces rather than duplicates an existing client tag", async () => {
    const reader = await read(Note, makeEvent([["client", "Coracle"]]))
    const tmpl = await buildTemplate(write(Note, reader).setClient("Flotilla"))

    expect(tmpl.tags).toEqual([["client", "Flotilla"]])
  })

  it("clears a client tag", async () => {
    const reader = await read(Note, makeEvent([["client", "Coracle"]]))
    const tmpl = await buildTemplate(write(Note, reader).clearClient())

    expect(tmpl.tags).toEqual([])
  })
})
