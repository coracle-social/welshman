import {getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Delete, DeleteBuilder} from "@welshman/domain"
import {Router} from "./router.js"
import {Tags} from "./tags.js"
import {Command} from "../command.js"
import {User} from "../user.js"
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

    // A delete should reach every relay its target lives on, so resolve manually
    // with a raised limit rather than using commandFromBuilder's default.
    const user = User.require(this.app)
    const template = await builder.toTemplate(user.signer)
    const scenario = await this.app.use(Router).resolve(await builder.routes())

    return new Command(this.app, template, scenario.limit(30).getUrls())
  }
}
