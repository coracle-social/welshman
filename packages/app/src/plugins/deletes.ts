import {uniq} from "@welshman/lib"
import {getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {DeleteBuilder} from "@welshman/domain"
import {Router} from "./router.js"
import {Tags} from "./tags.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

export type DeleteOptions = {
  tags?: string[][]
  relays?: string[]
  protect?: boolean
}

/**
 * NIP-09 event deletion (kind 5). Builds a delete request targeting the given
 * event and returns a `Command` for the caller to publish. By default the
 * request is sent to the user's write relays plus every relay the event has
 * been seen on, so it reaches wherever the event lives.
 */
export class Deletes {
  constructor(readonly app: IApp) {}

  deleteEvent = async (event: TrustedEvent, options: DeleteOptions = {}): Promise<Command> => {
    const {tags = [], relays, protect = false} = options
    const builder = new DeleteBuilder().addTags(
      ...tags,
      ["k", String(event.kind)],
      ...this.app.use(Tags).tagEvent(event),
    )

    const group = getTagValue("h", event.tags)

    if (group) {
      builder.setGroup(group)
    }

    if (protect) {
      builder.setProtected(true)
    }

    const urls =
      relays ??
      uniq([...this.app.use(Router).FromUser().getUrls(), ...this.app.tracker.getRelays(event.id)])

    return new Command(this.app, await builder.toTemplate(), urls)
  }
}
