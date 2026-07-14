import {describe, it, expect} from "vitest"
import {SLASH_COMMAND, NOTE} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {SlashCommand, parseSlashCommand, formatSlashCommand} from "../src/kinds/SlashCommand"
import {buildTemplate, read, write} from "./helpers.js"

const pubkey = "ee".repeat(32)

const makeEvent = (o: Partial<TrustedEvent> = {}): TrustedEvent =>
  ({
    id: "ff".repeat(32),
    pubkey,
    created_at: 0,
    kind: SLASH_COMMAND,
    tags: [],
    content: "",
    sig: "00".repeat(64),
    ...o,
  }) as TrustedEvent

const manifest = makeEvent({
  content: "A command that generates images using an LLM.",
  tags: [
    ["d", "generate"],
    ["k", "1"],
    ["k", "9"],
    ["h", "98d9s"],
    ["param", "model", "string"],
    ["param", "prompt", "string"],
    ["param", "style", "string", "optional"],
    ["options", "model", "GPT Image 1.5"],
    ["options", "model", "Nano Banana Pro"],
    ["options", "style", "illustration"],
  ],
})

describe("SlashCommand", () => {
  it("reads the manifest", async () => {
    const command = await read(SlashCommand, manifest)

    expect(command.name()).toBe("generate")
    expect(command.description()).toBe("A command that generates images using an LLM.")
    expect(command.kinds()).toEqual([1, 9])
    expect(command.groups()).toEqual(["98d9s"])
    expect(command.params()).toEqual([
      {label: "model", type: "string", optional: false},
      {label: "prompt", type: "string", optional: false},
      {label: "style", type: "string", optional: true},
    ])
    expect(command.options("model")).toEqual(["GPT Image 1.5", "Nano Banana Pro"])
    expect(command.options("style")).toEqual(["illustration"])
  })

  it("decides whether it applies to a context", async () => {
    const command = await read(SlashCommand, manifest)

    expect(command.appliesTo(1, "98d9s")).toBe(true)
    expect(command.appliesTo(9, "98d9s")).toBe(true)
    // wrong kind
    expect(command.appliesTo(20, "98d9s")).toBe(false)
    // wrong / missing group
    expect(command.appliesTo(1, "other")).toBe(false)
    expect(command.appliesTo(1)).toBe(false)
  })

  it("applies anywhere when no group is declared", async () => {
    const command = await read(
      SlashCommand,
      makeEvent({
        tags: [
          ["d", "ping"],
          ["k", "1"],
        ],
      }),
    )

    expect(command.appliesTo(1)).toBe(true)
    expect(command.appliesTo(1, "any-group")).toBe(true)
    expect(command.appliesTo(2)).toBe(false)
  })

  it("builds from a fresh builder", async () => {
    const tmpl = await buildTemplate(
      write(SlashCommand)
        .setName("generate")
        .setDescription("generate images")
        .setKinds([1, 9])
        .addGroup("98d9s")
        .addParam("model")
        .addParam("style", "string", true)
        .addOption("model", "Nano Banana Pro"),
    )

    expect(tmpl.kind).toBe(SLASH_COMMAND)
    expect(tmpl.tags).toContainEqual(["d", "generate"])
    expect(tmpl.tags).toContainEqual(["k", "1"])
    expect(tmpl.tags).toContainEqual(["k", "9"])
    expect(tmpl.tags).toContainEqual(["h", "98d9s"])
    expect(tmpl.tags).toContainEqual(["param", "model", "string"])
    expect(tmpl.tags).toContainEqual(["param", "style", "string", "optional"])
    expect(tmpl.tags).toContainEqual(["options", "model", "Nano Banana Pro"])
    expect(tmpl.content).toBe("generate images")
  })

  it("removeParam drops the param and its options", async () => {
    const command = await read(SlashCommand, manifest)
    const tmpl = await buildTemplate(
      write(SlashCommand, command)
        .setGroup("wss://relay.example.com/", "98d9s")
        .removeParam("model"),
    )

    expect(tmpl.tags.some(t => t[0] === "param" && t[1] === "model")).toBe(false)
    expect(tmpl.tags.some(t => t[0] === "options" && t[1] === "model")).toBe(false)
    // other params/options survive
    expect(tmpl.tags).toContainEqual(["param", "prompt", "string"])
    expect(tmpl.tags).toContainEqual(["options", "style", "illustration"])
  })

  it("requires a d tag (command name)", async () => {
    await expect(buildTemplate(write(SlashCommand).addKind(1))).rejects.toThrow()
  })

  it("throws on the wrong kind", async () => {
    await expect(read(SlashCommand, makeEvent({kind: NOTE}))).rejects.toThrow()
  })

  it("parses an invocation string", () => {
    expect(
      parseSlashCommand("/generate <Nano Banana Pro> <An image of a turtle> <photorealistic>"),
    ).toEqual({
      name: "generate",
      args: ["Nano Banana Pro", "An image of a turtle", "photorealistic"],
    })

    expect(parseSlashCommand("not a command")).toBeUndefined()
  })

  it("formats an invocation string", () => {
    expect(formatSlashCommand("generate", ["Nano Banana Pro", "a turtle"])).toBe(
      "/generate <Nano Banana Pro> <a turtle>",
    )
    expect(formatSlashCommand("ping")).toBe("/ping")
  })
})
