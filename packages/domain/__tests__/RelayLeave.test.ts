import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_LEAVE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayLeave, RelayLeaveBuilder} from "../src/kinds/RelayLeave"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const group = "wss://relay.example.com"

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_LEAVE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayLeave", () => {
  it("round-trips the group behavior tag without duplication", async () => {
    const leave = await RelayLeave.fromEvent(makeEvent({tags: [["h", group], ["alt", "x"]]}))

    expect(leave.group()).toBe(group)

    const tmpl = await leave.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(RELAY_LEAVE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", group])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the group via a fresh builder", async () => {
    const tmpl = await new RelayLeaveBuilder().group(group).toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["h", group])
  })

  it("throws on the wrong kind", async () => {
    await expect(RelayLeave.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
