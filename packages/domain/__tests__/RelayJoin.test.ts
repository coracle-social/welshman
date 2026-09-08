import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_JOIN, NOTE, relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayJoin} from "../src/kinds/RelayJoin"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_JOIN,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayJoin", () => {
  it("reads claim tag and reason content", async () => {
    const join = await read(
      RelayJoin,
      makeEvent({tags: [["claim", "abc123"]], content: "please let me in"}),
    )

    expect(join.claim()).toBe("abc123")
    expect(join.reason()).toBe("please let me in")
  })

  it("returns undefined for missing claim/reason", async () => {
    const join = await read(RelayJoin, makeEvent())

    expect(join.claim()).toBeUndefined()
    expect(join.reason()).toBeUndefined()
  })

  it("round-trips with no duplicate tags and preserves passthrough/content", async () => {
    const join = await read(
      RelayJoin,
      makeEvent({
        tags: [
          ["claim", "abc123"],
          ["alt", "x"],
        ],
        content: "let me in",
      }),
    )

    const tmpl = await buildTemplate(
      write(RelayJoin, join).forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.kind).toBe(RELAY_JOIN)
    expect(tmpl.tags.filter(t => t[0] === "claim").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
    expect(tmpl.content).toBe("let me in")
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RelayJoin)
        .setClaim("invite42")
        .setReason("hello")
        .forceRoutes(relay("wss://relay.example.com/")),
      signer,
    )

    expect(tmpl.tags).toContainEqual(["claim", "invite42"])
    expect(tmpl.content).toBe("hello")
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelayJoin, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
