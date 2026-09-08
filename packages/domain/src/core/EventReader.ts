import {spec, toInt} from "@welshman/lib"
import type {MaybeAsync} from "@welshman/lib"
import {tagSpec, tagValue, getAddress} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {KindContext} from "./Kind.js"
import {getEmojis} from "../behaviors/Emoji.js"
import type {Emoji} from "../behaviors/Emoji.js"
import {getZapSplits} from "../behaviors/ZapSplits.js"
import type {ZapSplit} from "../behaviors/ZapSplits.js"

/**
 * The accessors every reader shares. Readers don't extend this directly — they
 * pick a branch below according to whether parsing their event can hit IO, which
 * is what tells a caller whether `parse()` has to be awaited.
 */
export abstract class BaseEventReader {
  constructor(
    readonly kind: number,
    readonly context: KindContext,
    readonly event: TrustedEvent,
  ) {
    if (event.kind !== kind) {
      throw new Error(`Expected a kind ${kind} event, got kind ${event.kind}`)
    }
  }

  // Populate whatever the reader derives from the event, and return the reader so
  // callers can chain: `Profile.reader(event).parse().name()`.
  abstract parse(): MaybeAsync<this>

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

  room() {
    return tagValue(tagSpec("h"), this.event.tags)
  }

  protect() {
    return this.event.tags.some(spec(["-"]))
  }

  expiration() {
    return toInt(tagValue(tagSpec("expiration"), this.event.tags) ?? "")
  }

  contentWarning() {
    return this.event.tags.some(spec(["content-warning"]))
  }

  contentWarningReason() {
    return tagValue(tagSpec("content-warning"), this.event.tags)
  }

  emojis(): Emoji[] {
    return getEmojis(this.event)
  }

  zapSplits(): ZapSplit[] {
    return getZapSplits(this.event)
  }
}

/**
 * A reader whose event can be parsed without IO — the common case. `parse()`
 * returns the reader itself, so callers never await it. Override `parse` to
 * derive state from the event, returning `this`.
 */
export abstract class EventReader extends BaseEventReader {
  parse(): this {
    return this
  }
}

/**
 * A reader that has to decrypt (or otherwise await something) before its
 * accessors are complete. `parse()` returns a promise, so the type system makes
 * callers await it rather than silently reading a half-parsed event.
 */
export abstract class AsyncEventReader extends BaseEventReader {
  abstract parse(): Promise<this>
}

/**
 * What `reader.parse()` yields for a given reader — the reader for sync kinds, a
 * promise of it for kinds that decrypt. `await` works either way.
 */
export type Parsed<R extends BaseEventReader> = ReturnType<R["parse"]>
