import {describe, it, expect} from "vitest"
import {makeSecret, TOPICS} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {TopicList} from "../src/kinds/TopicList"
import {buildTemplate, read, write} from "./helpers.js"

const signer = new Nip01Signer(makeSecret())

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey: "ee".repeat(32),
    created_at: 0,
    kind: TOPICS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("ListWriter", () => {
  it("runs the base writer validation", async () => {
    const reader = await read(TopicList, makeEvent({tags: [["h", "room"]]}))

    await expect(buildTemplate(write(TopicList, reader), signer)).rejects.toThrow(
      "A room event requires a relay url",
    )
  })
})
