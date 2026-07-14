import {describe, it, expect} from "vitest"
import {RELAY_ROLE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {RelayRole} from "../src/kinds/RelayRole"
import {buildTemplate, read, write} from "./helpers.js"

const pubkey = "ee".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: RELAY_ROLE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("RelayRole", () => {
  it("reads the role id, label, description, color, and order", async () => {
    const reader = await read(
      RelayRole,
      makeEvent({
        tags: [
          ["d", "moderator"],
          ["label", "Moderator"],
          ["description", "Keeps the peace"],
          ["color", "120"],
          ["order", "2"],
        ],
      }),
    )

    expect(reader.identifier()).toBe("moderator")
    expect(reader.label()).toBe("Moderator")
    expect(reader.description()).toBe("Keeps the peace")
    expect(reader.color()).toBe(120)
    expect(reader.order()).toBe(2)
  })

  it("returns undefined when the hue is not a number", async () => {
    const reader = await read(
      RelayRole,
      makeEvent({
        tags: [
          ["d", "moderator"],
          ["color", "abc"],
        ],
      }),
    )

    expect(reader.color()).toBeUndefined()
  })

  it("returns undefined when there is no color tag", async () => {
    const reader = await read(RelayRole, makeEvent({tags: [["d", "moderator"]]}))

    expect(reader.color()).toBeUndefined()
  })

  it("defaults order to zero when missing or invalid", async () => {
    const missing = await read(RelayRole, makeEvent({tags: [["d", "moderator"]]}))
    const invalid = await read(
      RelayRole,
      makeEvent({
        tags: [
          ["d", "moderator"],
          ["order", "abc"],
        ],
      }),
    )

    expect(missing.order()).toBe(0)
    expect(invalid.order()).toBe(0)
  })

  it("builds a role from scratch", async () => {
    const tmpl = await buildTemplate(
      write(RelayRole)
        .setIdentifier("moderator")
        .setLabel("Moderator")
        .setDescription("Keeps the peace")
        .setColor(120)
        .setOrder(2)
        .forceRelays("wss://relay.example.com/"),
    )

    expect(tmpl.kind).toBe(RELAY_ROLE)
    expect(tmpl.tags).toContainEqual(["d", "moderator"])
    expect(tmpl.tags).toContainEqual(["label", "Moderator"])
    expect(tmpl.tags).toContainEqual(["description", "Keeps the peace"])
    expect(tmpl.tags).toContainEqual(["color", "120"])
    expect(tmpl.tags).toContainEqual(["order", "2"])
  })

  it("round-trips an existing role without duplicating tags", async () => {
    const reader = await read(
      RelayRole,
      makeEvent({
        tags: [
          ["d", "moderator"],
          ["label", "Moderator"],
          ["description", "Keeps the peace"],
          ["color", "120"],
          ["order", "2"],
          ["zzz", "x"],
        ],
      }),
    )

    const tmpl = await buildTemplate(
      write(RelayRole, reader).setLabel("Mod").setOrder(3).forceRelays("wss://relay.example.com/"),
    )

    expect(tmpl.tags.filter(t => t[0] === "d")).toEqual([["d", "moderator"]])
    expect(tmpl.tags.filter(t => t[0] === "label")).toEqual([["label", "Mod"]])
    expect(tmpl.tags.filter(t => t[0] === "description")).toEqual([
      ["description", "Keeps the peace"],
    ])
    expect(tmpl.tags.filter(t => t[0] === "color")).toEqual([["color", "120"]])
    expect(tmpl.tags.filter(t => t[0] === "order")).toEqual([["order", "3"]])
    expect(tmpl.tags).toContainEqual(["zzz", "x"])
  })

  it("setColor writes the hue", async () => {
    const tmpl = await buildTemplate(
      write(RelayRole)
        .setIdentifier("moderator")
        .setColor(120)
        .forceRelays("wss://relay.example.com/"),
    )

    expect(tmpl.tags).toContainEqual(["color", "120"])
  })

  it("requires a d tag", async () => {
    await expect(buildTemplate(write(RelayRole).setLabel("Moderator"))).rejects.toThrow(/d tag/)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(RelayRole, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
