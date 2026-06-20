import {describe, it, expect} from "vitest"
import {makeSecret, RELAY_ADD_MEMBER, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RelayAddMember, RelayAddMemberBuilder} from "../src/kinds/RelayAddMember"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_ADD_MEMBER,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RelayAddMember", () => {
  it("reads affected pubkeys, deduped", async () => {
    const op = await RelayAddMember.fromEvent(
      makeEvent({
        tags: [
          ["p", a],
          ["p", b],
          ["p", a],
        ],
      }),
    )

    expect(op.pubkeys().sort()).toEqual([a, b].sort())
  })

  it("round-trips with no duplicate p tags and passthrough", async () => {
    const op = await RelayAddMember.fromEvent(
      makeEvent({
        tags: [
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await op.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(RELAY_ADD_MEMBER)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds fresh with the right kind", async () => {
    const tmpl = await new RelayAddMemberBuilder().addPubkey(a).addPubkey(a).toTemplate(signer)

    expect(tmpl.kind).toBe(RELAY_ADD_MEMBER)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["p", a])
  })

  it("throws on the wrong kind", async () => {
    await expect(RelayAddMember.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
