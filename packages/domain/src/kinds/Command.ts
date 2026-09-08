import {removeUndefined, spec} from "@welshman/lib"
import {
  COMMAND,
  isCommandArgType,
  matchesCommandScopes,
  parseCommandScope,
  renderCommandScope,
  tagSpec,
  tagValue,
  tagValues,
  validateCommandArgs,
} from "@welshman/util"
import type {CommandArg, CommandArgType, CommandScope, CommandScopeTarget} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const parseArgTags = (tags: string[][]): CommandArg[] =>
  tags.filter(spec(["arg"])).map(([, name, type, required, label = name, ...choices]) => ({
    name,
    type: type as CommandArgType,
    required: required === "required",
    label,
    choices,
  }))

const parseScopeTags = (key: string, tags: string[][]): CommandScope[] =>
  removeUndefined(tagValues(tagSpec(key), tags).map(parseCommandScope))

// NIP-CD kind-31992 command definition.
export class CommandReader extends EventReader {
  command() {
    return tagValue(tagSpec("command"), this.event.tags)
  }

  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  description() {
    return tagValue(tagSpec("description"), this.event.tags)
  }

  // Args and scopes we don't understand get dropped, so a definition using a
  // newer type is still partly usable
  args(): CommandArg[] {
    return parseArgTags(this.event.tags).filter(arg => arg.name && isCommandArgType(arg.type))
  }

  scopes(): CommandScope[] {
    return parseScopeTags("s", this.event.tags)
  }

  ignored(): CommandScope[] {
    return parseScopeTags("ignore", this.event.tags)
  }

  matches(target: CommandScopeTarget) {
    return matchesCommandScopes(this.scopes(), this.ignored(), target)
  }
}

export class CommandWriter extends EventWriter<CommandReader> {
  setCommand(command: string) {
    return this.dropTags(spec(["command"])).addTags(["command", command])
  }

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setArgs(args: CommandArg[]) {
    return this.dropTags(spec(["arg"])).addTags(
      ...args.map(({name, type, required, label, choices}) => [
        "arg",
        name,
        type,
        required ? "required" : "optional",
        label,
        ...choices,
      ]),
    )
  }

  setScopes(scopes: CommandScope[]) {
    return this.dropTags(spec(["s"])).addTags(
      ...scopes.map(scope => ["s", renderCommandScope(scope)]),
    )
  }

  setIgnored(scopes: CommandScope[]) {
    return this.dropTags(spec(["ignore"])).addTags(
      ...scopes.map(scope => ["ignore", renderCommandScope(scope)]),
    )
  }

  validate() {
    super.validate()

    for (const key of ["command", "title", "description"]) {
      if (!tagValue(tagSpec(key), this.extraTags)) {
        throw new Error(`A command requires a ${key} tag`)
      }
    }

    // A trigger is matched against the text between the leading slash and the first space, so
    // one containing either can never fire. Keeping slashes out also leaves `//trigger` inert,
    // which is what lets someone write one without invoking it.
    if (/[\s/]/.test(tagValue(tagSpec("command"), this.extraTags) ?? "")) {
      throw new Error("A command trigger may not contain a slash or whitespace")
    }

    for (const [key, scope] of this.extraTags) {
      if (["s", "ignore"].includes(key) && !parseCommandScope(scope ?? "")) {
        throw new Error(`Invalid ${key} scope ${scope}`)
      }
    }

    validateCommandArgs(parseArgTags(this.extraTags))
  }
}

export class CommandQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Command = new KindFactory({
  kind: COMMAND,
  reader: CommandReader,
  writer: CommandWriter,
  query: CommandQuery,
})
