import {spec, toInt} from "@welshman/lib"
import {tagSpec, tagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {KindContext} from "./Kind.js"
import {getEmojis} from "../behaviors/Emoji.js"
import type {Emoji} from "../behaviors/Emoji.js"
import {getZapSplits} from "../behaviors/ZapSplits.js"
import type {ZapSplit} from "../behaviors/ZapSplits.js"

export abstract class EventReader {
  constructor(
    readonly kind: number,
    readonly context: KindContext,
    readonly event: TrustedEvent,
  ) {
    if (event.kind !== kind) {
      throw new Error(`Expected a kind ${kind} event, got kind ${event.kind}`)
    }
  }

  async parse(): Promise<void> {}

  id() {
    return this.event.id
  }

  author() {
    return this.event.pubkey
  }

  content() {
    return this.event.content
  }

  tags() {
    return this.event.tags
  }

  createdAt() {
    return this.event.created_at
  }

  identifier() {
    return tagValue(tagSpec("d"), this.event.tags)
  }

  address() {
    return getAddress(this.event)
  }

  group() {
    return tagValue(tagSpec("h"), this.event.tags)
  }

  protect() {
    return this.event.tags.some(spec(["-"]))
  }

  expiration() {
    return toInt(tagValue(tagSpec("expiration"), this.event.tags) ?? "")
  }

  emojis(): Emoji[] {
    return getEmojis(this.event)
  }

  zapSplits(): ZapSplit[] {
    return getZapSplits(this.event)
  }
}
