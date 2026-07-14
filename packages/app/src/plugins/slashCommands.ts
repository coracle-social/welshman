import {Address, SLASH_COMMAND, userOutbox, inbox, outbox, indexers} from "@welshman/util"
import {
  SlashCommand,
  SlashCommandReader,
  SlashCommandWriter,
  formatSlashCommand,
} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Domain} from "./domain.js"
import {User} from "../user.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * Kind-33318 slash command manifests, keyed by address (`33318:pubkey:name`).
 * A command declares the event kinds (`k`) and NIP-29 groups (`h`) it monitors;
 * use `forContext` to surface only the commands valid in a given kind/group.
 */
export class SlashCommands extends DerivedPlugin<SlashCommandReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [SLASH_COMMAND]}],
      eventToItem: app.use(Domain).reader(SlashCommand),
      getKey: (command: SlashCommandReader) => command.address(),
    })
  }

  async fetch(address: string) {
    const {kind, pubkey, identifier} = Address.from(address)
    const filters = [{kinds: [kind], authors: [pubkey], "#d": [identifier], limit: 1}]
    const scenario = await this.app.use(Router).resolve([outbox(pubkey), indexers()])
    const relays = scenario.getUrls()

    return this.app.use(Network).load({filters, relays})
  }

  loadForPubkey = async (pubkey: string) => {
    const filters = [{kinds: [SLASH_COMMAND], authors: [pubkey]}]
    const scenario = await this.app.use(Router).resolve([outbox(pubkey), indexers()])
    const relays = scenario.getUrls()

    return this.app.use(Network).load({filters, relays})
  }

  forPubkey = (pubkey: string): Projection<SlashCommandReader[]> =>
    projectFrom(this.all, commands => commands.filter(command => command.author() === pubkey))

  forContext = (kind: number, group?: string): Projection<SlashCommandReader[]> =>
    projectFrom(this.all, commands => commands.filter(command => command.appliesTo(kind, group)))

  update = async (name: string, fn: (writer: SlashCommandWriter) => void) => {
    const user = User.require(this.app)
    const address = new Address(SLASH_COMMAND, user.pubkey, name).toString()
    const writer = this.app.use(Domain).writer(SlashCommand, await this.forceLoad(address))

    writer.setName(name)
    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  invoke = async (
    command: SlashCommandReader,
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

    // Publish to the user's outbox and deliver to the command author's inbox.
    const scenario = await this.app
      .use(Router)
      .resolve([userOutbox(), inbox(command.author(), 0.5)])

    return new Command(this.app, event, scenario.getUrls())
  }
}
