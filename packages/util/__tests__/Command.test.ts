import {describe, it, expect} from "vitest"
import {Pubkey} from "../src/Pubkey"
import {
  bindCommandArgs,
  commandScopeRelays,
  commandScopesToFilter,
  getActiveCommandArgIndex,
  matchesCommandScopes,
  parseCommandArgs,
  parseCommandInvocation,
  parseCommandScope,
  renderCommandInvocation,
  renderCommandScope,
  validateCommandArgs,
} from "../src/Command"
import type {CommandArg} from "../src/Command"

const pubkey = "ee".repeat(32)
const npub = new Pubkey(pubkey).toNpub()
const target = "ab".repeat(32)
const targetNpub = new Pubkey(target).toNpub()

const makeArg = (overrides: Partial<CommandArg> = {}): CommandArg => ({
  name: "target",
  type: "pubkey",
  required: true,
  label: "Who",
  choices: [],
  ...overrides,
})

describe("parseCommandInvocation", () => {
  it("parses a bare command", () => {
    expect(parseCommandInvocation("/ban")).toEqual({command: "ban", pubkey: undefined, rest: ""})
  })

  it("parses a qualifier, with or without the nostr prefix", () => {
    expect(parseCommandInvocation(`/ban@${npub} rest`)).toEqual({
      command: "ban",
      pubkey,
      rest: "rest",
    })
    expect(parseCommandInvocation(`/ban@nostr:${npub} rest`)).toEqual({
      command: "ban",
      pubkey,
      rest: "rest",
    })
  })

  it("terminates a qualifier at the bech32 charset", () => {
    expect(parseCommandInvocation(`/ban@${npub}.`)).toEqual({command: "ban", pubkey, rest: "."})
  })

  it("rejects anything that isn't an invocation", () => {
    expect(parseCommandInvocation("hello /ban")).toBeUndefined()
    expect(parseCommandInvocation("/")).toBeUndefined()
    expect(parseCommandInvocation("/ban@npub1nope")).toBeUndefined()
  })
})

describe("parseCommandArgs", () => {
  const args = [makeArg(), makeArg({name: "reason", type: "text", required: false, label: "Why"})]

  it("binds tokens and a trailing text argument", () => {
    expect(parseCommandArgs(args, `${targetNpub} spamming  links`)).toEqual({
      target,
      reason: "spamming  links",
    })
  })

  it("accepts a nostr-prefixed entity", () => {
    expect(parseCommandArgs(args, `nostr:${targetNpub}`)).toEqual({target})
  })

  it("returns undefined when a required argument is missing or invalid", () => {
    expect(parseCommandArgs(args, "")).toBeUndefined()
    expect(parseCommandArgs(args, "not-a-pubkey reason")).toBeUndefined()
  })

  it("accepts hex for entity arguments", () => {
    expect(parseCommandArgs([makeArg()], target)).toEqual({target})
    expect(parseCommandArgs([makeArg({name: "id", type: "event"})], target)).toEqual({id: target})
  })

  it("validates enums, numbers, bools and relays", () => {
    const enumArg = makeArg({name: "scope", type: "enum", choices: ["room", "space"]})
    const numberArg = makeArg({name: "count", type: "number"})
    const boolArg = makeArg({name: "silent", type: "bool"})
    const relayArg = makeArg({name: "url", type: "relay"})

    expect(parseCommandArgs([enumArg], "room")).toEqual({scope: "room"})
    expect(parseCommandArgs([enumArg], "planet")).toBeUndefined()
    expect(parseCommandArgs([numberArg], "12")).toEqual({count: "12"})
    expect(parseCommandArgs([numberArg], "12x")).toBeUndefined()
    expect(parseCommandArgs([boolArg], "Yes")).toEqual({silent: "true"})
    expect(parseCommandArgs([boolArg], "n")).toEqual({silent: "false"})
    expect(parseCommandArgs([boolArg], "maybe")).toBeUndefined()
    expect(parseCommandArgs([relayArg], "wss://relay.example")).toEqual({
      url: "wss://relay.example/",
    })
    expect(parseCommandArgs([relayArg], "nope")).toBeUndefined()
  })
})

describe("command scopes", () => {
  it("round trips every scope type", () => {
    const scopes = ["kind:9", `author:${pubkey}`, "tag:h:62af9b0", "relay:wss://relay.example/"]

    for (const scope of scopes) {
      expect(renderCommandScope(parseCommandScope(scope)!)).toBe(scope)
    }
  })

  it("splits a tag scope on the first colon only", () => {
    expect(parseCommandScope("tag:r:wss://relay.example")).toEqual({
      type: "tag",
      name: "r",
      value: "wss://relay.example",
    })
  })

  it("rejects a malformed scope", () => {
    expect(parseCommandScope("phase:moon")).toBeUndefined()
    expect(parseCommandScope("kind:nine")).toBeUndefined()
    expect(parseCommandScope("relay:nope")).toBeUndefined()
    expect(parseCommandScope("author:nope")).toBeUndefined()
    expect(parseCommandScope("tag:h")).toBeUndefined()
    expect(parseCommandScope("kind")).toBeUndefined()
  })

  it("ors within a scope type and ands across them", () => {
    const scopes = [
      {type: "kind", kind: 9},
      {type: "kind", kind: 11},
      {type: "tag", name: "h", value: "a"},
    ] as const
    const target = {kind: 9, tags: [["h", "a"]]}

    expect(matchesCommandScopes([...scopes], [], target)).toBe(true)
    expect(matchesCommandScopes([...scopes], [], {...target, kind: 11})).toBe(true)
    expect(matchesCommandScopes([...scopes], [], {...target, kind: 1})).toBe(false)
    expect(matchesCommandScopes([...scopes], [], {kind: 9, tags: [["h", "b"]]})).toBe(false)
  })

  it("ors tag scopes sharing a name and ands ones that don't", () => {
    const scopes = [
      {type: "tag", name: "h", value: "a"},
      {type: "tag", name: "h", value: "b"},
      {type: "tag", name: "t", value: "nostr"},
    ] as const

    expect(
      matchesCommandScopes([...scopes], [], {
        kind: 9,
        tags: [
          ["h", "b"],
          ["t", "nostr"],
        ],
      }),
    ).toBe(true)
    expect(matchesCommandScopes([...scopes], [], {kind: 9, tags: [["h", "b"]]})).toBe(false)
  })

  it("excludes anything ignored", () => {
    const ignored = [{type: "author", pubkey}] as const

    expect(matchesCommandScopes([], [...ignored], {kind: 9, pubkey})).toBe(false)
    expect(matchesCommandScopes([], [...ignored], {kind: 9})).toBe(true)
  })
})

describe("validateCommandArgs", () => {
  it("rejects an ambiguous or malformed argument list", () => {
    expect(() =>
      validateCommandArgs([
        makeArg({name: "a", type: "word", required: false}),
        makeArg({name: "b", type: "text", required: false}),
      ]),
    ).toThrow("at most one optional argument")

    expect(() =>
      validateCommandArgs([makeArg({name: "message", type: "text"}), makeArg()]),
    ).toThrow("must be last")

    expect(() => validateCommandArgs([makeArg({name: "scope", type: "enum"})])).toThrow(
      "at least one choice",
    )

    expect(() =>
      validateCommandArgs([{...makeArg(), type: "sigil" as CommandArg["type"]}]),
    ).toThrow("unknown type")
  })

  it("accepts a valid argument list", () => {
    expect(() =>
      validateCommandArgs([makeArg(), makeArg({name: "reason", type: "text", required: false})]),
    ).not.toThrow()
  })
})

describe("renderCommandInvocation", () => {
  it("renders with and without a qualifier", () => {
    expect(renderCommandInvocation("ban")).toBe("/ban")
    expect(renderCommandInvocation("ban", pubkey)).toBe(`/ban@${npub}`)
  })
})

describe("bindCommandArgs", () => {
  const args = [makeArg(), makeArg({name: "reason", type: "text", required: false, label: "Why"})]

  it("binds only the arguments the text supplies", () => {
    expect(bindCommandArgs(args, "")).toEqual([])
    expect(bindCommandArgs(args, targetNpub)).toEqual([
      {arg: args[0], token: targetNpub, value: target},
    ])
  })

  it("reports a bad token without discarding the good ones", () => {
    expect(bindCommandArgs(args, "nope spamming links")).toEqual([
      {arg: args[0], token: "nope", value: undefined},
      {arg: args[1], token: "spamming links", value: "spamming links"},
    ])
  })
})

describe("getActiveCommandArgIndex", () => {
  const args = [makeArg(), makeArg({name: "reason", type: "text", required: false})]

  it("advances once a token is finished", () => {
    expect(getActiveCommandArgIndex(args, "")).toBe(0)
    expect(getActiveCommandArgIndex(args, "npub1abc")).toBe(0)
    expect(getActiveCommandArgIndex(args, "npub1abc ")).toBe(1)
    expect(getActiveCommandArgIndex(args, "npub1abc spamming links")).toBe(1)
  })

  it("stays on a text argument, which eats the rest of the line", () => {
    expect(getActiveCommandArgIndex(args, "npub1abc a b c ")).toBe(1)
  })

  it("handles a command with no arguments", () => {
    expect(getActiveCommandArgIndex([], "")).toBe(0)
  })
})

describe("commandScopesToFilter", () => {
  it("maps indexable scopes and leaves the rest to matchesCommandScopes", () => {
    const scopes = [
      "kind:9",
      "kind:11",
      `author:${pubkey}`,
      "tag:h:62af9b0",
      "tag:h:other",
      "tag:custom:x",
      "relay:wss://relay.example/",
    ].map(scope => parseCommandScope(scope)!)

    expect(commandScopesToFilter(scopes)).toEqual({
      kinds: [9, 11],
      authors: [pubkey],
      "#h": ["62af9b0", "other"],
    })

    expect(commandScopeRelays(scopes)).toEqual(["wss://relay.example/"])
  })

  it("is empty for an unscoped command", () => {
    expect(commandScopesToFilter([])).toEqual({})
    expect(commandScopeRelays([])).toEqual([])
  })
})
