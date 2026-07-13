import {getTagValue} from "@welshman/util"
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

  // `fn` lets the caller tweak the writer — e.g. `addEmoji` for NIP-30 custom
  // emoji, or `setProtected(true)` for NIP-70.
  react = async (
    event: TrustedEvent,
    content: string,
    fn?: (writer: ReactionWriter) => void,
  ): Promise<Command> => {
    const writer = this.app.use(Domain).writer(Reaction).setContent(content).setEvent(event)

    // A reaction to a NIP-29 group message goes to the group's relay — where the
    // target event lives (per the tracker).
    const group = getTagValue("h", event.tags)
    const [url] = this.app.tracker.getRelays(event.id)

    if (group && url) writer.setGroup(url, group)

    fn?.(writer)

    return this.app.use(Domain).command(writer)
  }
}
