import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_CREATE_PERMISSION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomCreatePermission, RoomCreatePermissionBuilder} from "../src/kinds/RoomCreatePermission"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const a = "aa".repeat(32)
const b = "bb".repeat(32)
const c = "cc".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_CREATE_PERMISSION,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomCreatePermission", () => {
  it("reads permitted pubkeys from p tags", async () => {
    const perm = await RoomCreatePermission.fromEvent(
      makeEvent({
        tags: [
          ["p", a],
          ["p", b],
          ["p", a],
        ],
      }),
    )

    expect(perm.pubkeys().sort()).toEqual([a, b].sort())
    expect(perm.canCreate(a)).toBe(true)
    expect(perm.canCreate(c)).toBe(false)
  })

  it("round-trips with no duplicate p tags and passthrough", async () => {
    const perm = await RoomCreatePermission.fromEvent(
      makeEvent({
        tags: [
          ["p", a],
          ["p", b],
          ["alt", "x"],
        ],
      }),
    )

    const tmpl = await perm.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_CREATE_PERMISSION)
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets pubkeys via a fresh builder, deduped", async () => {
    const tmpl = await new RoomCreatePermissionBuilder().setPubkeys([a, b, a]).toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["p", a])
    expect(tmpl.tags).toContainEqual(["p", b])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomCreatePermission.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
