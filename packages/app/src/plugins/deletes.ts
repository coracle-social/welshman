import type {TrustedEvent} from "@welshman/util"
import {Delete, DeleteWriter} from "@welshman/domain"
import {Domain} from "./domain.js"
import {Command} from "../command.js"
import {User} from "../user.js"
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

    // A delete should reach every relay its target lives on, so build the
    // scenario ourselves and raise the limit above the default.
    User.require(this.app)

    const [template, scenario] = await Promise.all([writer.render(), writer.scenario()])

    return new Command(this.app, template, scenario.limit(30).getUrls())
  }
}
