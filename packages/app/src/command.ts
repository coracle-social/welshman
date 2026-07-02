import {ManagementMethod} from "@welshman/util"
import type {EventTemplate} from "@welshman/util"
import type {IApp} from "./app.js"
import {Thunks} from "./plugins/thunk.js"
import {RelayManagement} from "./plugins/relayManagement.js"

/**
 * An event paired with the relays it's meant for, without committing to how
 * it gets published. Plugin mutation methods (`create`/`update`/etc.) build
 * the event and return a `Command` instead of publishing it directly, so the
 * caller decides: `publish()` sends it through the normal `Thunks` pipeline,
 * `publishAsRelay(url)` signs it and delivers it straight to one relay.
 */
export class Command {
  constructor(
    readonly app: IApp,
    readonly event: EventTemplate,
    readonly relays: string[],
  ) {}

  publish = () => this.app.use(Thunks).publish({event: this.event, relays: this.relays})

  publishAsRelay = (url: string) => this.app.use(RelayManagement).publishToRelay(url, this.event)

  signAsRelay = (url: string) =>
    this.app.use(RelayManagement).post(url, {
      method: ManagementMethod.SignEvent,
      params: [this.event],
    })
}

export const publish = (command: Command) => command.publish()

export const publishAsRelay = (url: string) => (command: Command) => command.publishAsRelay(url)

export const signAsRelay = (url: string) => (command: Command) => command.signAsRelay(url)
