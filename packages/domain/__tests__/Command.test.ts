import {describe, it, expect} from "vitest"
import {COMMAND} from "@welshman/util"
import type {CommandArg, TrustedEvent} from "@welshman/util"
import {Command} from "../src/kinds/Command"
import {buildTemplate, read, write} from "./helpers.js"

const pubkey = "ee".repeat(32)
const author = "ab".repeat(32)

const makeEvent = (overrides: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: COMMAND,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...overrides,
  }) as TrustedEvent

const makeArg = (overrides: Partial<CommandArg> = {}): CommandArg => ({
  name: "target",
  type: "pubkey",
  required: true,
  label: "Who",
  choices: [],
  ...overrides,
})

const definition = makeEvent({
  tags: [
    ["d", "8f2c1a"],
    ["command", "ban"],
    ["title", "Ban a user"],
    ["description", "Removes a user."],
    ["arg", "target", "pubkey", "required", "Who to ban"],
    ["arg", "reason", "text", "optional", "Why"],
    ["s", "kind:9"],
    ["s", "kind:11"],
    ["s", "tag:h:62af9b0"],
    ["s", "relay:wss://relay.example"],
    ["ignore", `tag:p:${author}`],
  ],
})

describe("Command", () => {
  it("reads represented tags", async () => {
    const command = await read(Command, definition)

    expect(command.command()).toBe("ban")
    expect(command.title()).toBe("Ban a user")
    expect(command.description()).toBe("Removes a user.")
    expect(command.args()).toEqual([
      {name: "target", type: "pubkey", required: true, label: "Who to ban", choices: []},
      {name: "reason", type: "text", required: false, label: "Why", choices: []},
    ])
    expect(command.scopes()).toEqual([
      {type: "kind", kind: 9},
      {type: "kind", kind: 11},
      {type: "tag", name: "h", value: "62af9b0"},
      {type: "relay", url: "wss://relay.example/"},
    ])
    expect(command.ignored()).toEqual([{type: "tag", name: "p", value: author}])
  })

  it("drops args and scopes it doesn't understand", async () => {
    const command = await read(
      Command,
      makeEvent({
        tags: [
          ["arg", "target", "sigil", "required", "Who"],
          ["s", "phase:moon"],
          ["s", "kind:9"],
        ],
      }),
    )

    expect(command.args()).toEqual([])
    expect(command.scopes()).toEqual([{type: "kind", kind: 9}])
  })

  it("matches a target against its scopes", async () => {
    const command = await read(Command, definition)
    const target = {kind: 9, pubkey, tags: [["h", "62af9b0"]], url: "wss://relay.example/"}

    expect(command.matches(target)).toBe(true)
    expect(command.matches({...target, kind: 11})).toBe(true)
    expect(command.matches({...target, kind: 1})).toBe(false)
    expect(command.matches({...target, url: "wss://other.example/"})).toBe(false)
    expect(command.matches({...target, tags: [["h", "elsewhere"]]})).toBe(false)
    expect(command.matches({kind: 9})).toBe(false)
  })

  it("excludes anything ignored", async () => {
    const command = await read(Command, definition)
    const target = {
      kind: 9,
      pubkey,
      tags: [
        ["h", "62af9b0"],
        ["p", author],
      ],
      url: "wss://relay.example/",
    }

    expect(command.matches(target)).toBe(false)
  })

  it("treats an empty scope as unrestricted", async () => {
    const command = await read(Command, makeEvent({tags: [["ignore", "kind:1"]]}))

    expect(command.matches({kind: 9})).toBe(true)
    expect(command.matches({kind: 1})).toBe(false)
  })

  it("writes a definition", async () => {
    const template = await buildTemplate(
      write(Command)
        .setIdentifier("8f2c1a")
        .setCommand("ban")
        .setTitle("Ban a user")
        .setDescription("Removes a user.")
        .setArgs([
          makeArg(),
          makeArg({name: "reason", type: "text", required: false, label: "Why"}),
        ])
        .setScopes([
          {type: "kind", kind: 9},
          {type: "tag", name: "h", value: "62af9b0"},
          {type: "relay", url: "wss://relay.example/"},
        ])
        .setIgnored([{type: "author", pubkey: author}]),
    )

    expect(template.kind).toBe(COMMAND)
    expect(template.tags).toContainEqual(["command", "ban"])
    expect(template.tags).toContainEqual(["arg", "target", "pubkey", "required", "Who"])
    expect(template.tags).toContainEqual(["arg", "reason", "text", "optional", "Why"])
    expect(template.tags).toContainEqual(["s", "kind:9"])
    expect(template.tags).toContainEqual(["s", "tag:h:62af9b0"])
    expect(template.tags).toContainEqual(["s", "relay:wss://relay.example/"])
    expect(template.tags).toContainEqual(["ignore", `author:${author}`])
  })

  it("rejects a trigger that could never fire", async () => {
    const writer = write(Command)
      .setIdentifier("a")
      .setTitle("Ban")
      .setDescription("Removes a user.")
      .setCommand("/ban")

    await expect(buildTemplate(writer)).rejects.toThrow("slash or whitespace")
  })

  it("rejects an invalid scope", async () => {
    const writer = write(Command)
      .setIdentifier("a")
      .setCommand("ban")
      .setTitle("Ban")
      .setDescription("Removes a user.")
      .addTags(["s", "phase:moon"])

    await expect(buildTemplate(writer)).rejects.toThrow("Invalid s scope")
  })

  it("rejects an ambiguous argument list", async () => {
    const twoOptional = write(Command)
      .setIdentifier("a")
      .setCommand("ban")
      .setTitle("Ban")
      .setDescription("Removes a user.")
      .setArgs([
        makeArg({name: "a", type: "word", required: false}),
        makeArg({name: "b", type: "text", required: false}),
      ])

    await expect(buildTemplate(twoOptional)).rejects.toThrow("at most one optional argument")

    const textFirst = write(Command)
      .setIdentifier("a")
      .setCommand("say")
      .setTitle("Say")
      .setDescription("Says something.")
      .setArgs([
        makeArg({name: "message", type: "text"}),
        makeArg({name: "target", type: "pubkey"}),
      ])

    await expect(buildTemplate(textFirst)).rejects.toThrow("must be last")
  })
})
