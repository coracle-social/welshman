import {describe, it, expect} from "vitest"
import {NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {getExpiration} from "../src/behaviors/Expiration"
import {isProtected} from "../src/behaviors/Protected"
import {Note} from "../src/kinds/Note"
import {read} from "./helpers.js"

const makeEvent = (tags: string[][]): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "aa".repeat(32),
    created_at: 0,
    kind: NOTE,
    tags,
    content: "",
    sig: "00".repeat(64),
  }) as TrustedEvent

describe("getExpiration", () => {
  it("parses an expiration timestamp", () => {
    expect(getExpiration(makeEvent([["expiration", "1700000000"]]))).toBe(1700000000)
  })

  it("returns undefined when the tag is absent or not a number", () => {
    expect(getExpiration(makeEvent([["t", "nostr"]]))).toBeUndefined()
    expect(getExpiration(makeEvent([["expiration"]]))).toBeUndefined()
    expect(getExpiration(makeEvent([["expiration", "soon"]]))).toBeUndefined()
  })

  it("backs the reader's expiration getter", async () => {
    const reader = await read(Note, makeEvent([["expiration", "1700000000"]]))

    expect(reader.expiration()).toBe(1700000000)
  })
})

describe("isProtected", () => {
  it("detects the NIP-70 marker", () => {
    expect(isProtected(makeEvent([["-"]]))).toBe(true)
    expect(isProtected(makeEvent([["t", "nostr"]]))).toBe(false)
  })

  it("backs the reader's protect getter", async () => {
    expect((await read(Note, makeEvent([["-"]]))).protect()).toBe(true)
    expect((await read(Note, makeEvent([]))).protect()).toBe(false)
  })
})
