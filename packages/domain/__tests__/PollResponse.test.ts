import {describe, it, expect} from "vitest"
import {makeSecret, POLL_RESPONSE, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {PollResponse} from "../src/kinds/PollResponse"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)
const poll = "aa".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: POLL_RESPONSE,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

describe("PollResponse", () => {
  it("parses the poll id and deduped selections", async () => {
    const event = makeEvent({
      tags: [
        ["e", poll],
        ["response", "1"],
        ["response", "2"],
        ["response", "1"],
        ["alt", "x"],
      ],
    })

    const response = await PollResponse.read(event)

    expect(response.pollId()).toBe(poll)
    expect(response.selections()).toEqual(["1", "2"])
  })

  it("round-trips with no duplication", async () => {
    const event = makeEvent({
      tags: [
        ["e", poll],
        ["response", "1"],
        ["response", "2"],
        ["alt", "x"],
      ],
    })

    const tmpl = await PollResponse.builder(await PollResponse.read(event)).toTemplate(signer)

    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "response").length).toBe(2)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await PollResponse.builder()
      .setPollId(poll)
      .addSelection("1")
      .addSelection("1")
      .addSelection("2")
      .toTemplate(signer)

    expect(tmpl.kind).toBe(POLL_RESPONSE)
    expect(tmpl.tags).toContainEqual(["e", poll])
    expect(tmpl.tags.filter(t => t[0] === "response")).toEqual([
      ["response", "1"],
      ["response", "2"],
    ])
  })

  it("requires a poll id", async () => {
    await expect(PollResponse.builder().addSelection("1").toTemplate(signer)).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(PollResponse.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
