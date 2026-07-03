import type {EventTemplate} from "@welshman/util"
import type {IApp} from "./app.js"
import {Thunks} from "./plugins/thunk.js"
import {RelayManagement} from "./plugins/relayManagement.js"

/**
 * An event paired with the relays it's meant for, without committing to how
 * it gets published. Plugin mutation methods (`create`/`update`/etc.) build
 * the event and return a `Command` instead of publishing it directly, so the
 * caller decides: `publish()` sends it through the normal `Thunks` pipeline,
 * `publishToRelays(urls)` targets a specific set of relays, and
 * `publishAsRelay(url)` has the relay sign the event with its own key (NIP-86
 * `signevent`) before publishing it back to that relay.
 */
export class Command {
  constructor(
    readonly app: IApp,
    readonly event: EventTemplate,
    readonly relays: string[],
  ) {}

  publish = () => this.publishToRelays(this.relays)

  publishToRelays = (urls: string[]) =>
    this.app.use(Thunks).publish({event: this.event, relays: urls})

  // Ask the relay to sign the event with its own key via NIP-86 `signevent`,
  // then publish the relay-signed event back to that relay.
  publishAsRelay = async (url: string) => {
    const {result, error} = await this.signAsRelay(url)

    if (!result) {
      throw new Error(error || "Relay did not return a signed event")
    }

    return this.app.use(Thunks).publish({event: result, relays: [url]})
  }

  signAsRelay = (url: string) => this.app.use(RelayManagement).forUrl(url).signEvent(this.event)
}

export const publish = (command: Command) => command.publish()

export const publishToRelays = (urls: string[]) => (command: Command) =>
  command.publishToRelays(urls)

export const publishAsRelay = (url: string) => (command: Command) => command.publishAsRelay(url)

export const signAsRelay = (url: string) => (command: Command) => command.signAsRelay(url)
