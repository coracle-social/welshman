import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_INVITE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayInvite} from "../src/kinds/RelayInvite"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_INVITE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayInvite", () => {
  it("reads the claim tag", async () => {
    const event = makeEvent({
      tags: [
        ["claim", "secret-code"],
        ["alt", "x"],
      ],
    })

    const invite = await read(RelayInvite, event)

    expect(invite.claim()).toBe("secret-code")
  })

  it("round-trips with no duplicate claim tag", async () => {
    const event = makeEvent({
      tags: [
        ["claim", "secret-code"],
        ["alt", "x"],
      ],
    })

    const tmpl = await buildTemplate(
      write(RelayInvite, await read(RelayInvite, event)).forceRelays("wss://relay.example.com/"),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "claim").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["claim", "secret-code"])
    // Unknown passthrough tag survives.
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(RelayInvite).setClaim("fresh-code").forceRelays("wss://relay.example.com/"),
      signer,
    )

    expect(tmpl.kind).toBe(RELAY_INVITE)
    expect(tmpl.tags).toContainEqual(["claim", "fresh-code"])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelayInvite, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
