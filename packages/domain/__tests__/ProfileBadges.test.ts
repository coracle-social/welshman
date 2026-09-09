import {describe, it, expect} from "vitest"
import {makeSecret, BADGES, BADGE_DEFINITION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {ProfileBadges} from "../src/kinds/ProfileBadges"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const bravery = `${BADGE_DEFINITION}:${pubkey}:bravery`
const honesty = `${BADGE_DEFINITION}:${pubkey}:honesty`
const braveryAward = "11".repeat(32)
const honestyAward = "22".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BADGES,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("ProfileBadges", () => {
  it("reads a/e pairs in display order", async () => {
    const badges = await read(
      ProfileBadges,
      makeEvent({
        tags: [
          ["d", "profile_badges"],
          ["a", bravery],
          ["e", braveryAward, "wss://relay.example.com/"],
          ["a", honesty],
          ["e", honestyAward],
        ],
      }),
    )

    expect(badges.badges()).toEqual([
      {address: bravery, awardId: braveryAward, relay: "wss://relay.example.com/"},
      {address: honesty, awardId: honestyAward, relay: undefined},
    ])
    expect(badges.includes(bravery)).toBe(true)
    expect(badges.includes(`${BADGE_DEFINITION}:${pubkey}:kindness`)).toBe(false)
  })

  it("ignores an a tag with no award after it", async () => {
    const badges = await read(
      ProfileBadges,
      makeEvent({
        tags: [
          ["d", "profile_badges"],
          ["a", bravery],
          ["a", honesty],
          ["e", honestyAward],
        ],
      }),
    )

    expect(badges.badges()).toEqual([{address: honesty, awardId: honestyAward, relay: undefined}])
  })

  it("builds pairs in the order they were added", async () => {
    const tmpl = await buildTemplate(
      write(ProfileBadges)
        .addBadge({address: bravery, awardId: braveryAward})
        .addBadge({address: honesty, awardId: honestyAward, relay: "wss://relay.example.com/"}),
      signer,
    )

    expect(tmpl.kind).toBe(BADGES)
    expect(tmpl.tags).toContainEqual(["d", "profile_badges"])
    expect(tmpl.tags.filter(t => ["a", "e"].includes(t[0]))).toEqual([
      ["a", bravery],
      ["e", braveryAward],
      ["a", honesty],
      ["e", honestyAward, "wss://relay.example.com/"],
    ])
  })

  it("moves a badge already displayed to the end rather than listing it twice", async () => {
    const tmpl = await buildTemplate(
      write(ProfileBadges)
        .addBadge({address: bravery, awardId: braveryAward})
        .addBadge({address: honesty, awardId: honestyAward})
        .addBadge({address: bravery, awardId: braveryAward}),
      signer,
    )

    expect(tmpl.tags.filter(t => ["a", "e"].includes(t[0]))).toEqual([
      ["a", honesty],
      ["e", honestyAward],
      ["a", bravery],
      ["e", braveryAward],
    ])
  })

  it("removes a badge along with its award", async () => {
    const event = makeEvent({
      tags: [
        ["d", "profile_badges"],
        ["a", bravery],
        ["e", braveryAward],
        ["a", honesty],
        ["e", honestyAward],
      ],
    })

    const tmpl = await buildTemplate(
      write(ProfileBadges, await read(ProfileBadges, event)).removeBadge(bravery),
      signer,
    )

    expect(tmpl.tags.filter(t => ["a", "e"].includes(t[0]))).toEqual([
      ["a", honesty],
      ["e", honestyAward],
    ])
  })

  it("identifies itself as profile_badges whatever the event said", async () => {
    const event = makeEvent({tags: [["d", "wrong"]]})
    const tmpl = await buildTemplate(write(ProfileBadges, await read(ProfileBadges, event)), signer)

    expect(tmpl.tags.filter(t => t[0] === "d")).toEqual([["d", "profile_badges"]])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(ProfileBadges, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
