import {Address, SLASH_COMMAND} from "@welshman/util"
import {SlashCommand, SlashCommandBuilder, formatSlashCommand} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * Kind-33318 slash command manifests, keyed by address (`33318:pubkey:name`).
 * A command declares the event kinds (`k`) and NIP-29 groups (`h`) it monitors;
 * use `forContext` to surface only the commands valid in a given kind/group.
 */
export class SlashCommands extends DerivedPlugin<SlashCommand> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SLASH_COMMAND]}],
      eventToItem: SlashCommand.factory(),
      getKey: (command: SlashCommand) => command.address(),
    })
  }

  fetch(address: string) {
    const {kind, pubkey, identifier} = Address.from(address)
    const filters = [{kinds: [kind], authors: [pubkey], "#d": [identifier], limit: 1}]
    const networking = this.app.use(Network)
    const router = this.app.use(Router)

    return Promise.all([
      networking.load({filters, relays: router.FromPubkey(pubkey).getUrls()}),
      networking.load({filters, relays: router.Index().getUrls()}),
    ])
  }

  // Load every command published by an author.
  loadForPubkey = (pubkey: string) => {
    const filters = [{kinds: [SLASH_COMMAND], authors: [pubkey]}]
    const networking = this.app.use(Network)
    const router = this.app.use(Router)

    return Promise.all([
      networking.load({filters, relays: router.FromPubkey(pubkey).getUrls()}),
      networking.load({filters, relays: router.Index().getUrls()}),
    ])
  }

  forPubkey = (pubkey: string): Projection<SlashCommand[]> =>
    projectFrom(this.all, commands => commands.filter(command => command.author() === pubkey))

  // Commands that should be surfaced in the given kind/group context. A command
  // with no `h` tags can be invoked anywhere.
  forContext = (kind: number, group?: string): Projection<SlashCommand[]> =>
    projectFrom(this.all, commands => commands.filter(command => command.appliesTo(kind, group)))

  // Publish/update one of the app user's own command manifests.
  update = async (name: string, fn: (builder: SlashCommandBuilder) => void) => {
    const user = User.require(this.app)
    const address = new Address(SLASH_COMMAND, user.pubkey, name).toString()
    const builder = new SlashCommandBuilder(await this.forceLoad(address))

    builder.setName(name)
    fn(builder)

    const event = await builder.toTemplate(user.signer)
    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }

  // Invoke a command: publish a `/name <args>` message in one of the command's
  // monitored kinds, p-tagging the command's author (and h-tagging the group when
  // invoked inside one).
  invoke = (
    command: SlashCommand,
    args: string[],
    {kind, group}: {kind?: number; group?: string} = {},
  ) => {
    const tags = [["p", command.author()]]

    if (group) tags.push(["h", group])

    const event = {
      kind: kind ?? command.kinds()[0],
      content: formatSlashCommand(command.name()!, args),
      tags,
    }

    const relays = this.app.use(Router).FromUser().getUrls()

    return new Command(this.app, event, relays)
  }
}
