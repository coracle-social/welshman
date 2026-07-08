import {getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Delete, DeleteBuilder} from "@welshman/domain"
import {Router} from "./router.js"
import {Tags} from "./tags.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-09 event deletion (kind 5). Builds a delete request targeting the given
 * event and returns a `Command` for the caller to publish.
 */
export class Deletes {
  constructor(readonly app: IApp) {}

  // `fn` lets the caller tweak the builder — e.g. `addTags` for extra references,
  // or `setProtected(true)` for NIP-70.
  deleteEvent = async (
    event: TrustedEvent,
    fn?: (builder: DeleteBuilder) => void,
  ): Promise<Command> => {
    const eventTags = await this.app.use(Tags).tagEvent(event)
    const builder = Delete.builder().addTags(["k", String(event.kind)], ...eventTags)

    // A delete of a NIP-29 group message goes to the group's relay — where the
    // target event lives (per the tracker).
    const group = getTagValue("h", event.tags)
    const [url] = this.app.tracker.getRelays(event.id)

    if (group && url) {
      builder.setGroup(url, group)
    }

    fn?.(builder)

    return this.app.use(Router).commandFromBuilder(builder, scenario => scenario.limit(30))
  }
}
