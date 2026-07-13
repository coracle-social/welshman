import {getTagValue} from "@welshman/util"
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

  // `fn` lets the caller tweak the writer — e.g. `addEvent` for extra targets,
  // or `setProtected(true)` for NIP-70.
  deleteEvent = async (
    event: TrustedEvent,
    fn?: (writer: DeleteWriter) => void,
  ): Promise<Command> => {
    const writer = this.app.use(Domain).writer(Delete).addEvent(event)

    // A delete of a NIP-29 group message goes to the group's relay — where the
    // target event lives (per the tracker).
    const group = getTagValue("h", event.tags)
    const [url] = this.app.tracker.getRelays(event.id)

    if (group && url) {
      writer.setGroup(url, group)
    }

    fn?.(writer)

    // A delete should reach every relay its target lives on, so build the
    // scenario ourselves and raise the limit above the default.
    User.require(this.app)

    const [template, scenario] = await Promise.all([writer.render(), writer.scenario()])

    return new Command(this.app, template, scenario.limit(30).getUrls())
  }
}
