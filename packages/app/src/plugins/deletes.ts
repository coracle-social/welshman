import type {TrustedEvent} from "@welshman/util"
import {Delete, DeleteWriter} from "@welshman/domain"
import {Domain} from "./domain.js"
import type {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-09 event deletion (kind 5). Builds a delete request targeting the given
 * event and returns a `Command` for the caller to publish.
 */
export class Deletes {
  constructor(readonly app: IApp) {}

  deleteEvent = async (
    event: TrustedEvent,
    fn?: (writer: DeleteWriter) => void,
  ): Promise<Command> => {
    const [url] = this.app.tracker.getRelays(event.id)
    const writer = this.app.use(Domain).writer(Delete).addEvent(event, url)

    fn?.(writer)

    return this.app.use(Domain).command(writer)
  }
}
