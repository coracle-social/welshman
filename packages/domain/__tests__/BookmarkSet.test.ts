import {describe, it, expect} from "vitest"
import {makeSecret, NAMED_BOOKMARKS, NOTE, hexTags, tagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {BookmarkSet} from "../src/kinds/BookmarkSet"
import {buildTemplate, buildEvent, read, write} from "./helpers.js"

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
    kind: NAMED_BOOKMARKS,
    tags: [["d", "reading"]],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("BookmarkSet", () => {
  it("reads its metadata and its entries", async () => {
    const event = makeEvent({
      tags: [
        ["d", "reading"],
        ["title", "Reading list"],
        ["description", "Things to read"],
        ["image", "https://example.com/cover.png"],
        ["e", noteId],
        ["a", address],
        ["t", "nostr"],
        ["r", url],
      ],
    })

    const set = await read(BookmarkSet, event)

    expect(set.identifier()).toBe("reading")
    expect(set.title()).toBe("Reading list")
    expect(set.description()).toBe("Things to read")
    expect(set.image()).toBe("https://example.com/cover.png")
    expect(set.ids()).toEqual([noteId])
    expect(set.addresses()).toEqual([address])
    expect(set.topics()).toEqual(["nostr"])
    expect(set.urls()).toEqual([url])
  })

  it("requires an identifier", async () => {
    await expect(
      buildTemplate(write(BookmarkSet).bookmarkPublicly(["e", noteId]), signer),
    ).rejects.toThrow()

    const tmpl = await buildTemplate(
      write(BookmarkSet).setIdentifier("reading").setTitle("Reading list"),
      signer,
    )

    expect(tmpl.kind).toBe(NAMED_BOOKMARKS)
    expect(tmpl.tags).toContainEqual(["d", "reading"])
  })

  it("replaces its title rather than listing it twice", async () => {
    const event = makeEvent({
      tags: [
        ["d", "reading"],
        ["title", "Reading list"],
        ["e", noteId],
      ],
    })

    const set = await read(BookmarkSet, event)
    const tmpl = await buildTemplate(
      write(BookmarkSet, set).setTitle("Later").bookmarkPublicly(["e", noteId2]),
      signer,
    )

    expect(tmpl.tags.filter(t => t[0] === "title")).toEqual([["title", "Later"]])
    expect(tagValues(hexTags("e"), tmpl.tags)).toEqual([noteId, noteId2])
  })

  it("keeps private entries through a metadata edit", async () => {
    const event = await buildEvent(
      write(BookmarkSet).setIdentifier("reading").bookmarkPrivately(["e", noteId2]),
      signer,
    )

    const set = await read(BookmarkSet, event, signer)
    const edited = await buildEvent(write(BookmarkSet, set).setTitle("Later"), signer)
    const reread = await read(BookmarkSet, edited, signer)

    expect(reread.title()).toBe("Later")
    expect(reread.ids()).toEqual([noteId2])
  })

  it("removeBookmark removes by value", async () => {
    const event = makeEvent({
      tags: [
        ["d", "reading"],
        ["e", noteId],
        ["e", noteId2],
      ],
    })

    const set = await read(BookmarkSet, event)
    const tmpl = await buildTemplate(write(BookmarkSet, set).removeBookmark(noteId), signer)

    expect(tagValues(hexTags("e"), tmpl.tags)).toEqual([noteId2])
  })

  it("round-trips public and private bookmarks through encryption", async () => {
    const event = await buildEvent(
      write(BookmarkSet)
        .setIdentifier("reading")
        .bookmarkPublicly(["e", noteId])
        .bookmarkPrivately(["e", noteId2]),
      signer,
    )

    expect(tagValues(hexTags("e"), event.tags)).toEqual([noteId])
    expect(event.content).not.toBe("")

    const decrypted = await read(BookmarkSet, event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.ids().sort()).toEqual([noteId, noteId2].sort())

    const publicOnly = await read(BookmarkSet, event)

    expect(publicOnly.decrypted).toBe(false)
    expect(publicOnly.ids()).toEqual([noteId])
  })

  it("throws on the wrong kind", async () => {
    await expect(read(BookmarkSet, makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
