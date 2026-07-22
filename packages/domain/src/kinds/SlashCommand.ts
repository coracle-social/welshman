import {removeUndefined, spec} from "@welshman/lib"
import {SLASH_COMMAND, kindTags, matchTags, tagSpec, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// A declared parameter: its label, a type hint (`string`/`number`/`pubkey`/
// `topic`/`relay`) used for client-side input/auto-complete, and whether it's
// optional.
export type SlashCommandParam = {
  label: string
  type: string
  optional: boolean
}

// A parsed `/name <arg1> <arg2>` invocation.
export type SlashCommandInvocation = {
  name: string
  args: string[]
}

// Parse a `/name <arg1> <arg2>` invocation string; undefined if `content` isn't
// a slash command. Arguments are wrapped in angle brackets for unambiguous parsing.
export const parseSlashCommand = (content: string): SlashCommandInvocation | undefined => {
  const match = content.trim().match(/^\/(\S+)/)

  if (!match) return undefined

  return {
    name: match[1],
    args: Array.from(content.matchAll(/<([^>]*)>/g)).map(m => m[1]),
  }
}

// Format a `/name <arg1> <arg2>` invocation string.
export const formatSlashCommand = (name: string, args: string[] = []) =>
  [`/${name}`, ...args.map(arg => `<${arg}>`)].join(" ")

// kind-33318 slash command manifest. Its `d` tag is the command name; `k` tags
// are the monitored event kinds, `h` tags are the monitored NIP-29 groups (none
// means it can be invoked anywhere).
export class SlashCommandReader extends EventReader {
  name() {
    return this.identifier()
  }

  description() {
    return this.event.content
  }

  kinds() {
    return tagValues(kindTags("k"), this.event.tags)
  }

  groups() {
    return tagValues(tagSpec("h"), this.event.tags)
  }

  params(): SlashCommandParam[] {
    return matchTags(tagSpec("param"), this.event.tags).map(tag => ({
      label: tag[1],
      type: tag[2] || "string",
      optional: tag[3] === "optional",
    }))
  }

  options(label: string) {
    return matchTags(tagSpec("options"), this.event.tags)
      .filter(tag => tag[1] === label)
      .map(tag => tag[2])
  }

  // Whether the command should be surfaced in the given kind/group context. A
  // command with no `h` tags can be invoked anywhere.
  appliesTo(kind: number, group?: string) {
    const groups = this.groups()

    return (
      this.kinds().includes(kind) &&
      (groups.length === 0 || (group !== undefined && groups.includes(group)))
    )
  }
}

export class SlashCommandWriter extends EventWriter<SlashCommandReader> {
  setName(name: string) {
    return this.setIdentifier(name)
  }

  setDescription(description: string) {
    return this.setContent(description)
  }

  addKind(kind: number) {
    return this.dropTags(spec(["k", String(kind)])).addTags(["k", String(kind)])
  }

  setKinds(kinds: number[]) {
    return this.dropTags(spec(["k"])).addTags(...kinds.map(kind => ["k", String(kind)]))
  }

  addGroup(group: string) {
    return this.dropTags(spec(["h", group])).addTags(["h", group])
  }

  setGroups(groups: string[]) {
    return this.dropTags(spec(["h"])).addTags(...groups.map(group => ["h", group]))
  }

  addParam(label: string, type = "string", optional = false) {
    return this.dropTags(spec(["param", label])).addTags(
      removeUndefined(["param", label, type, optional ? "optional" : undefined]),
    )
  }

  removeParam(label: string) {
    return this.dropTags(tag => ["param", "options"].includes(tag[0] as string) && tag[1] === label)
  }

  addOption(label: string, option: string) {
    return this.addTags(["options", label, option])
  }

  setOptions(label: string, options: string[]) {
    return this.dropTags(tag => tag[0] === "options" && tag[1] === label).addTags(
      ...options.map(option => ["options", label, option]),
    )
  }
}

export const SlashCommand = new KindFactory({
  kind: SLASH_COMMAND,
  reader: SlashCommandReader,
  writer: SlashCommandWriter,
})
