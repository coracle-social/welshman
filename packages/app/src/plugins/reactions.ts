import {tagSpec, tagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Reaction, ReactionWriter} from "@welshman/domain"
import {Domain} from "./domain.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-25 reactions (kind 7). Reactions are unbounded and keyed by their target
 * event rather than by pubkey or address, so there's no derived collection —
 * read them from the repository directly.
 */
export class Reactions {
  constructor(readonly app: IApp) {}

  react = async (
    event: TrustedEvent,
    content: string,
    fn?: (writer: ReactionWriter) => void,
  ): Promise<Command> => {
    const writer = this.app.use(Domain).writer(Reaction).setContent(content).setEvent(event)

    // A reaction to a NIP-29 room message goes to the room's relay — where the
    // target event lives (per the tracker).
    const room = tagValue(tagSpec("h"), event.tags)
    const [url] = this.app.tracker.getRelays(event.id)

    if (room && url) writer.setRoom(url, room)

    fn?.(writer)

    return this.app.use(Domain).command(writer)
  }
}
