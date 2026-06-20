import {describe, it, expect} from "vitest"
import {makeSecret, BOOKMARKS, NOTE, getEventTagValues, getTopicTagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {BookmarkList, BookmarkListBuilder} from "../src/kinds/BookmarkList"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const noteId = "11".repeat(32)
const noteId2 = "22".repeat(32)
const address = `30023:${"aa".repeat(32)}:article-1`
const url = "https://example.com/post"

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: BOOKMARKS,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("BookmarkList", () => {
  it("reads mixed bookmark entries", async () => {
    const event = makeEvent({
      tags: [
        ["e", noteId],
        ["a", address],
        ["t", "nostr"],
        ["r", url],
        ["alt", "x"],
      ],
    })

    const list = await BookmarkList.fromEvent(event)

    expect(list.ids()).toEqual([noteId])
    expect(list.addresses()).toEqual([address])
    expect(list.topics()).toEqual(["nostr"])
    expect(list.urls()).toEqual([url])
  })

  it("round-trips without duplicating tags and preserves passthrough", async () => {
    const event = makeEvent({
      tags: [
        ["e", noteId],
        ["a", address],
        ["t", "nostr"],
        ["r", url],
        ["alt", "x"],
      ],
    })

    const list = await BookmarkList.fromEvent(event)
    const tmpl = await list.builder().toTemplate(signer)

    expect(tmpl.kind).toBe(BOOKMARKS)
    expect(tmpl.tags.filter(t => t[0] === "e").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "a").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "t").length).toBe(1)
    expect(tmpl.tags.filter(t => t[0] === "r").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await new BookmarkListBuilder()
      .bookmarkPublicly(["e", noteId])
      .bookmarkPublicly(["t", "nostr"])
      .toTemplate(signer)

    expect(getEventTagValues(tmpl.tags)).toEqual([noteId])
    expect(getTopicTagValues(tmpl.tags)).toEqual(["nostr"])
  })

  it("removeBookmark removes by value", async () => {
    const event = makeEvent({
      tags: [
        ["e", noteId],
        ["e", noteId2],
      ],
    })
    const list = await BookmarkList.fromEvent(event)

    const tmpl = await list.builder().removeBookmark(noteId).toTemplate(signer)

    expect(getEventTagValues(tmpl.tags)).toEqual([noteId2])
  })

  it("round-trips public and private bookmarks through encryption", async () => {
    const event = await new BookmarkListBuilder()
      .bookmarkPublicly(["e", noteId])
      .bookmarkPrivately(["e", noteId2])
      .toEvent(signer)

    expect(getEventTagValues(event.tags)).toEqual([noteId])
    expect(event.content).not.toBe("")

    const decrypted = await BookmarkList.fromEvent(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.ids().sort()).toEqual([noteId, noteId2].sort())

    const publicOnly = await BookmarkList.fromEvent(event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.ids()).toEqual([noteId])
  })

  it("preserves undecrypted ciphertext on pass-through", async () => {
    const event = await new BookmarkListBuilder().bookmarkPrivately(["e", noteId2]).toEvent(signer)
    const undecrypted = await BookmarkList.fromEvent(event)

    const tmpl = await undecrypted.builder().toTemplate(signer)

    expect(tmpl.content).toBe(event.content)
  })

  it("refuses private mutation when undecrypted", async () => {
    const event = await new BookmarkListBuilder().bookmarkPrivately(["e", noteId2]).toEvent(signer)
    const undecrypted = await BookmarkList.fromEvent(event)

    await expect(
      undecrypted.builder().bookmarkPrivately(["e", noteId]).toEvent(signer),
    ).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(BookmarkList.fromEvent(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
