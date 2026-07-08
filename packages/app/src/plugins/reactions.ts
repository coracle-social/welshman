import {getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Reaction, ReactionBuilder} from "@welshman/domain"
import {Router} from "./router.js"
import {Tags} from "./tags.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

/**
 * NIP-25 reactions (kind 7). Reactions are unbounded and keyed by their target
 * event rather than by pubkey or address, so there's no derived collection —
 * read them from the repository directly.
 */
export class Reactions {
  constructor(readonly app: IApp) {}

  // `fn` lets the caller tweak the builder — e.g. `addTags` for NIP-30 custom
  // emoji, or `setProtected(true)` for NIP-70.
  react = async (
    event: TrustedEvent,
    content: string,
    fn?: (builder: ReactionBuilder) => void,
  ): Promise<Command> => {
    const reactionTags = await this.app.use(Tags).tagEventForReaction(event)
    const builder = Reaction.builder().setContent(content).addTags(...reactionTags)

    // A reaction to a NIP-29 group message goes to the group's relay — where the
    // target event lives (per the tracker).
    const group = getTagValue("h", event.tags)
    const [url] = this.app.tracker.getRelays(event.id)

    if (group && url) builder.setGroup(url, group)

    fn?.(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }
}
