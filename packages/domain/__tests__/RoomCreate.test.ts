import {describe, it, expect} from "vitest"
import {makeSecret, ROOM_CREATE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {RoomCreate, RoomCreateBuilder} from "../src/kinds/RoomCreate"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const group = "abcd1234"

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: ROOM_CREATE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("RoomCreate", () => {
  it("round-trips the group behavior tag without duplication", async () => {
    const create = await RoomCreate.fromEvent(
      makeEvent({
        tags: [
          ["h", group],
          ["alt", "x"],
        ],
      }),
    )

    expect(create.group()).toBe(group)

    const tmpl = await create.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(ROOM_CREATE)
    expect(tmpl.tags.filter(t => t[0] === "h").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["h", group])
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("sets the group via a fresh builder", async () => {
    const tmpl = await new RoomCreateBuilder().setGroup(group).toTemplate(signer)

    expect(tmpl.tags).toContainEqual(["h", group])
  })

  it("throws on the wrong kind", async () => {
    await expect(RoomCreate.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
