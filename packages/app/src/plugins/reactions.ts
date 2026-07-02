import {getTagValue} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {ReactionBuilder} from "@welshman/domain"
import {Router} from "./router.js"
import {Tags} from "./tags.js"
import {Command} from "../command.js"
import type {IApp} from "../app.js"

export type ReactOptions = {
  // Extra tags to include, e.g. NIP-30 custom emoji tags from an emoji picker
  tags?: string[][]
  // Explicit target relays; relays[0] doubles as the relay hint on the reaction tags
  relays?: string[]
  // Add a NIP-70 protected tag
  protect?: boolean
}

/**
 * NIP-25 reactions (kind 7). Reactions are unbounded and keyed by their target
 * event rather than by pubkey or address, so there's no derived collection —
 * read them from the repository directly. `react` builds the reaction event
 * and returns a `Command` for the caller to publish.
 */
export class Reactions {
  constructor(readonly app: IApp) {}

  react = async (
    event: TrustedEvent,
    content: string,
    options: ReactOptions = {},
  ): Promise<Command> => {
    const {tags = [], relays, protect = false} = options
    const builder = new ReactionBuilder()
      .setContent(content)
      .addTags(...tags, ...this.app.use(Tags).tagEventForReaction(event, relays?.[0]))

    const group = getTagValue("h", event.tags)

    if (group) builder.setGroup(group)
    if (protect) builder.setProtected(true)

    const router = this.app.use(Router)
    const urls = relays ?? router.merge([router.FromUser(), router.Replies(event)]).getUrls()

    return new Command(this.app, await builder.toTemplate(), urls)
  }
}
