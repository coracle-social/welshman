import {describe, it, expect} from "vitest"
import {makeSecret, BADGE_AWARD, BADGE_DEFINITION, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {BadgeAward} from "../src/kinds/BadgeAward"
import {
  buildTemplate,
  publishRelays,
  markerResolver,
  read,
  write,
  INBOX,
  OUTBOX,
} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const awardee = "aa".repeat(32)
const other = "bb".repeat(32)
const address = `${BADGE_DEFINITION}:${pubkey}:bravery`

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BADGE_AWARD,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("BadgeAward", () => {
  it("reads the badge and its awardees", async () => {
    const award = await read(
      BadgeAward,
      makeEvent({
        tags: [
          ["a", address],
          ["p", awardee, "wss://relay.example.com/"],
          ["p", other],
        ],
      }),
    )

    expect(award.badge()).toBe(address)
    expect(award.awardees()).toEqual([awardee, other])
  })

  it("awards one badge to many pubkeys, without listing anyone twice", async () => {
    const tmpl = await buildTemplate(
      write(BadgeAward)
        .setBadge(`${BADGE_DEFINITION}:${pubkey}:honesty`)
        .setBadge(address)
        .addAwardee(awardee)
        .addAwardee(other)
        .addAwardee(awardee),
      signer,
    )

    expect(tmpl.kind).toBe(BADGE_AWARD)
    expect(tmpl.tags.filter(t => t[0] === "a")).toEqual([["a", address]])
    expect(tmpl.tags.filter(t => t[0] === "p").length).toBe(2)
  })

  it("drops an awardee", async () => {
    const tmpl = await buildTemplate(
      write(BadgeAward)
        .setBadge(address)
        .addAwardee(awardee)
        .addAwardee(other)
        .removeAwardee(awardee),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "p")).toEqual([["p", other, ""]])
  })

  it("requires a badge and an awardee", async () => {
    await expect(buildTemplate(write(BadgeAward).addAwardee(awardee), signer)).rejects.toThrow()
    await expect(buildTemplate(write(BadgeAward).setBadge(address), signer)).rejects.toThrow()
  })

  it("publishes to the issuer's outbox and the awardees' inboxes", async () => {
    const writer = write(BadgeAward, undefined, markerResolver)
      .setBadge(address)
      .addAwardee(awardee)

    const relays = await publishRelays(writer)

    expect(relays).toHaveLength(2)
    expect(relays).toContain(OUTBOX)
    expect(relays).toContain(INBOX)
  })

  it("throws on the wrong kind", async () => {
    await expect(read(BadgeAward, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
