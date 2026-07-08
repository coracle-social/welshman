import {describe, it, expect} from "vitest"
import {makeSecret, APP_DATA, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Nip01Signer} from "@welshman/signer"
import {AppData} from "../src/kinds/AppData"

const signer = new Nip01Signer(makeSecret())
const pubkey = "ee".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: APP_DATA,
    tags: [["d", "my-app/settings"]],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

describe("AppData", () => {
  it("reads plaintext JSON values", async () => {
    const reader = await AppData.read(makeEvent({content: JSON.stringify({theme: "dark"})}))

    expect(reader.decrypted).toBe(true)
    expect(reader.encrypted).toBe(false)
    expect(reader.identifier()).toBe("my-app/settings")
    expect(reader.values<{theme: string}>()).toEqual({theme: "dark"})
  })

  it("treats empty content as decrypted with no values", async () => {
    const reader = await AppData.read(makeEvent())

    expect(reader.decrypted).toBe(true)
    expect(reader.encrypted).toBe(false)
    expect(reader.values()).toBeUndefined()
  })

  it("builds plaintext app data", async () => {
    const tmpl = await AppData.builder()
      .setIdentifier("my-app/settings")
      .setValues({theme: "dark"})
      .toTemplate()

    expect(tmpl.kind).toBe(APP_DATA)
    expect(tmpl.tags).toContainEqual(["d", "my-app/settings"])
    expect(JSON.parse(tmpl.content)).toEqual({theme: "dark"})
  })

  it("round-trips encrypted values", async () => {
    const event = await AppData.builder()
      .setIdentifier("my-app/settings")
      .setValues({theme: "dark"})
      .setEncrypted(true)
      .toEvent(signer)

    const decrypted = await AppData.read(event, signer)

    expect(decrypted.decrypted).toBe(true)
    expect(decrypted.encrypted).toBe(true)
    expect(decrypted.values<{theme: string}>()).toEqual({theme: "dark"})

    const opaque = await AppData.read(event)

    expect(opaque.decrypted).toBe(false)
    expect(opaque.encrypted).toBe(true)
    expect(opaque.values()).toBeUndefined()
  })

  it("re-encrypts by default when editing an encrypted event", async () => {
    const event = await AppData.builder()
      .setIdentifier("my-app/settings")
      .setValues({theme: "dark"})
      .setEncrypted(true)
      .toEvent(signer)

    const reader = await AppData.read(event, signer)
    const edited = await AppData.builder(reader).setValues({theme: "light"}).toEvent(signer)

    const reread = await AppData.read(edited, signer)

    expect(reread.encrypted).toBe(true)
    expect(reread.values<{theme: string}>()).toEqual({theme: "light"})
  })

  it("preserves ciphertext when editing without decryption", async () => {
    const event = await AppData.builder()
      .setIdentifier("my-app/settings")
      .setValues({theme: "dark"})
      .setEncrypted(true)
      .toEvent(signer)

    const reader = await AppData.read(event)
    const tmpl = await AppData.builder(reader).addTags(["alt", "x"]).toTemplate()

    expect(tmpl.content).toBe(event.content)
    expect(tmpl.tags).toContainEqual(["alt", "x"])
  })

  it("throws when modifying values without decryption", async () => {
    const event = await AppData.builder()
      .setIdentifier("my-app/settings")
      .setValues({theme: "dark"})
      .setEncrypted(true)
      .toEvent(signer)

    const reader = await AppData.read(event)

    await expect(AppData.builder(reader).setValues({theme: "light"}).toTemplate(signer)).rejects.toThrow(
      "Unable to modify app data when decryption was not performed",
    )
  })

  it("round-trips unmodeled tags", async () => {
    const reader = await AppData.read(
      makeEvent({
        tags: [
          ["d", "my-app/featured-content"],
          ["content", "value"],
        ],
      }),
    )

    const tmpl = await AppData.builder(reader).toTemplate()

    expect(tmpl.tags.filter(t => t[0] === "d").length).toBe(1)
    expect(tmpl.tags).toContainEqual(["content", "value"])
  })

  it("throws without a signer when encrypting", async () => {
    await expect(
      AppData.builder()
        .setIdentifier("my-app/settings")
        .setValues({theme: "dark"})
        .setEncrypted(true)
        .toTemplate(),
    ).rejects.toThrow("A signer is required to encrypt app data")
  })

  it("throws without a d tag", async () => {
    await expect(AppData.builder().setValues({theme: "dark"}).toTemplate()).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(AppData.read(makeEvent({kind: NOTE}))).rejects.toThrow()
  })
})
