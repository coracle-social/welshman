import {groupBy, isHex32, spec, tryCatch} from "@welshman/lib"
import {decode, npubEncode} from "nostr-tools/nip19"
import {Address} from "./Address.js"
import {Pubkey} from "./Pubkey.js"
import {fromNostrURI} from "./Links.js"
import {isRelayUrl, normalizeRelayUrl} from "./Relay.js"
import type {Filter} from "./Filters.js"

// Arguments

export const COMMAND_ARG_TYPES = [
  "pubkey",
  "event",
  "address",
  "relay",
  "number",
  "bool",
  "enum",
  "word",
  "text",
] as const

export type CommandArgType = (typeof COMMAND_ARG_TYPES)[number]

export type CommandArg = {
  name: string
  type: CommandArgType
  required: boolean
  label: string
  choices: string[]
}

export const isCommandArgType = (type: string): type is CommandArgType =>
  COMMAND_ARG_TYPES.includes(type as CommandArgType)

export const validateCommandArgs = (args: CommandArg[]) => {
  if (args.filter(arg => !arg.required).length > 1) {
    throw new Error("A command may have at most one optional argument")
  }

  if (args.filter(arg => arg.type === "text").length > 1) {
    throw new Error("A command may have at most one text argument")
  }

  for (const arg of args) {
    if (!isCommandArgType(arg.type)) {
      throw new Error(`Argument ${arg.name} has an unknown type ${arg.type}`)
    }

    if (arg.type === "enum" && arg.choices.length === 0) {
      throw new Error(`Argument ${arg.name} must have at least one choice`)
    }
  }

  // Arguments are positional, so anything that may be absent or eat the rest of
  // the line has to come last
  for (const arg of args.slice(0, -1)) {
    if (!arg.required || arg.type === "text") {
      throw new Error(`Argument ${arg.name} must be last`)
    }
  }
}

// Scopes

export type CommandScope =
  | {type: "kind"; kind: number}
  | {type: "relay"; url: string}
  | {type: "author"; pubkey: string}
  | {type: "tag"; name: string; value: string}

// What a scope is tested against: an event, plus the relay it came from or is bound for
export type CommandScopeTarget = {
  kind: number
  pubkey?: string
  tags?: string[][]
  url?: string
}

export const parseCommandScope = (scope: string): CommandScope | undefined => {
  const [type, name, ...rest] = scope.split(":")
  const value = scope.slice(type.length + 1)

  if (type === "kind") {
    return /^\d+$/.test(value) ? {type, kind: parseInt(value)} : undefined
  }

  if (type === "relay") {
    return isRelayUrl(value) ? {type, url: normalizeRelayUrl(value)} : undefined
  }

  if (type === "author") {
    const pubkey = tryCatch(() => Pubkey.from(value).toString())

    return pubkey ? {type, pubkey} : undefined
  }

  if (type === "tag") {
    return name && rest.length > 0 ? {type, name, value: rest.join(":")} : undefined
  }

  return undefined
}

export const renderCommandScope = (scope: CommandScope) => {
  if (scope.type === "kind") return `kind:${scope.kind}`
  if (scope.type === "relay") return `relay:${scope.url}`
  if (scope.type === "author") return `author:${scope.pubkey}`

  return `tag:${scope.name}:${scope.value}`
}

// Scopes of one type are alternatives, so group them before combining. Tag scopes
// group by tag name, which makes the whole thing read like a nostr filter.
const scopeKey = (scope: CommandScope) => (scope.type === "tag" ? `tag:${scope.name}` : scope.type)

const matchesCommandScope = (scope: CommandScope, target: CommandScopeTarget) => {
  if (scope.type === "kind") return target.kind === scope.kind
  if (scope.type === "relay") return target.url === scope.url
  if (scope.type === "author") return target.pubkey === scope.pubkey

  return Boolean(target.tags?.some(spec([scope.name, scope.value])))
}

// Scopes of one type are ored, types are anded, a type that isn't mentioned is
// unrestricted, and anything ignored is excluded regardless
export const matchesCommandScopes = (
  scopes: CommandScope[],
  ignored: CommandScope[],
  target: CommandScopeTarget,
) => {
  if (ignored.some(scope => matchesCommandScope(scope, target))) return false

  for (const alternatives of groupBy(scopeKey, scopes).values()) {
    if (!alternatives.some(scope => matchesCommandScope(scope, target))) return false
  }

  return true
}

// The relays an executor listens on. An unscoped command has none, and is heard wherever its
// reader happens to be subscribed.
export const commandScopeRelays = (scopes: CommandScope[]) =>
  scopes.flatMap(scope => (scope.type === "relay" ? [scope.url] : []))

// A subscription covering a command's scope, for an executor that wants to listen for it.
// Relays aren't part of a filter (see `commandScopeRelays`), multi-letter tag scopes aren't
// indexed, and `ignore` is subtractive, so this is a superset — check what comes back with
// `matchesCommandScopes` rather than trusting the filter alone.
export const commandScopesToFilter = (scopes: CommandScope[]) => {
  const filter: Filter = {}

  for (const [key, alternatives] of groupBy(scopeKey, scopes)) {
    if (key === "kind") {
      filter.kinds = alternatives.flatMap(s => (s.type === "kind" ? [s.kind] : []))
    }

    if (key === "author") {
      filter.authors = alternatives.flatMap(s => (s.type === "author" ? [s.pubkey] : []))
    }

    if (key.startsWith("tag:")) {
      const name = key.slice(4)

      if (name.length === 1) {
        filter[`#${name}`] = alternatives.flatMap(s => (s.type === "tag" ? [s.value] : []))
      }
    }
  }

  return filter
}

// Invocations

export type CommandInvocation = {
  command: string
  pubkey?: string
  rest: string
}

// A trigger runs to the first whitespace or qualifier, and must be non-empty
const TRIGGER = /^\/([^\s@]+)/

// bech32 is lowercase alphanumeric, so a qualifier ends at punctuation without a delimiter
const QUALIFIER = /^@(?:nostr:)?([a-z0-9]+)/

// Parse the command and optional executor from the start of an event's content. `rest` is
// left alone, since binding it to arguments takes the command's definition.
export const parseCommandInvocation = (content: string): CommandInvocation | undefined => {
  const trigger = content.match(TRIGGER)

  if (!trigger) return undefined

  const qualifier = content.slice(trigger[0].length).match(QUALIFIER)
  const pubkey = qualifier && tryCatch(() => Pubkey.from(qualifier[1]).toString())

  if (qualifier && !pubkey) return undefined

  const consumed = trigger[0].length + (qualifier?.[0].length ?? 0)

  return {
    command: trigger[1],
    pubkey: pubkey || undefined,
    rest: content.slice(consumed).trimStart(),
  }
}

export type CommandArgBinding = {
  arg: CommandArg
  token: string
  // Absent when the token doesn't validate as the argument's type
  value?: string
}

// Bind the remainder of an invocation to a definition's arguments, one entry per token the
// text actually supplies. Values are normalized: entities to hex, relays to normalized urls,
// bools to "true"/"false". Nothing is rejected, so a half-typed invocation still says which
// arguments are in hand and which one is wrong.
export const bindCommandArgs = (args: CommandArg[], rest: string): CommandArgBinding[] => {
  const bindings: CommandArgBinding[] = []
  let cursor = rest

  for (const arg of args) {
    cursor = cursor.trimStart()

    if (!cursor) break

    // A text argument takes the remainder verbatim, so it never splits on whitespace
    const token = arg.type === "text" ? cursor : cursor.split(/\s/)[0]

    bindings.push({arg, token, value: parseCommandArg(arg, token)})
    cursor = cursor.slice(token.length)
  }

  return bindings
}

// The invocation's arguments keyed by name, or undefined if a required argument is missing or
// any argument fails to validate. This is what an executor wants; a composer guiding input as
// it's typed wants `bindCommandArgs`.
export const parseCommandArgs = (
  args: CommandArg[],
  rest: string,
): Record<string, string> | undefined => {
  const bindings = bindCommandArgs(args, rest)
  const values: Record<string, string> = {}

  for (const {arg, value} of bindings) {
    if (value === undefined) return undefined

    values[arg.name] = value
  }

  // Whatever the invocation left off has to have been optional
  for (const arg of args.slice(bindings.length)) {
    if (arg.required) return undefined
  }

  return values
}

// Arguments are positional and typed left to right, so the one being entered is however many
// tokens are already finished. A text argument eats the rest of the line, which the clamp
// covers. Use it to point a composer at the argument the cursor is in.
export const getActiveCommandArgIndex = (args: CommandArg[], rest: string) => {
  const tokens = rest.split(/\s+/).filter(Boolean)
  const finished = /\s$/.test(rest) ? tokens.length : Math.max(0, tokens.length - 1)

  return Math.min(finished, Math.max(0, args.length - 1))
}

const TRUE = ["true", "yes", "1", "t", "y"]

const FALSE = ["false", "no", "0", "f", "n"]

const parseCommandArg = (arg: CommandArg, token: string) => {
  const entity = fromNostrURI(token)

  if (arg.type === "pubkey") {
    return tryCatch(() => Pubkey.from(entity).toString())
  }

  if (arg.type === "event") {
    if (isHex32(entity)) return entity

    return tryCatch(() => {
      const {type, data} = decode(entity)

      if (type === "note") return data
      if (type === "nevent") return data.id

      throw new Error(`Invalid event: ${entity}`)
    })
  }

  if (arg.type === "address") {
    return tryCatch(() => Address.fromNaddr(entity).toString())
  }

  if (arg.type === "relay") {
    return isRelayUrl(token) ? normalizeRelayUrl(token) : undefined
  }

  if (arg.type === "number") {
    return /^\d+$/.test(token) ? token : undefined
  }

  if (arg.type === "bool") {
    const value = token.toLowerCase()

    if (TRUE.includes(value)) return "true"
    if (FALSE.includes(value)) return "false"

    return undefined
  }

  if (arg.type === "enum") {
    return arg.choices.includes(token) ? token : undefined
  }

  return token
}

// Omit the pubkey to invoke every matching command, pass it to target a single executor
export const renderCommandInvocation = (command: string, pubkey?: string) =>
  "/" + command + (pubkey ? "@" + npubEncode(pubkey) : "")
