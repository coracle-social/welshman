import {uniq} from "@welshman/lib"
import {getPubkeyTagValues, userOutbox, outbox, inbox, indexers, relayHint} from "@welshman/util"
import type {TrustedEvent, RelaySelection} from "@welshman/util"
import type {EventReader} from "./EventReader.js"
import type {EventBuilder} from "./EventBuilder.js"

/**
 * Computes the relay routes an event should be published to, decoupled from
 * whether we're holding a finished event or a still-being-edited builder — the
 * owning `Kind` constructs one via `Kind.router(event?, builder?)`. Given a
 * builder, `getReader()` exposes its seed reader (the pre-mutation state), which
 * some kinds need (e.g. a relay list must still reach a relay it just dropped) —
 * a router subclass pins `R` to that reader type (e.g. `EventRouter<RelayListReader>`)
 * so `getReader()` is typed.
 *
 * Subclasses implement `routes()`. The shared strategies below cover the common
 * cases; a kind picks one as its `router`.
 */
export abstract class EventRouter<R extends EventReader = EventReader> {
  constructor(
    protected readonly event?: TrustedEvent,
    protected readonly builder?: EventBuilder<R>,
  ) {}

  abstract routes(): Promise<RelaySelection[]>

  // The event's current tags — from the finished event, or built from the builder
  // (no content encryption, so no signer needed).
  protected getTags(): Promise<string[][]> {
    return this.builder ? this.builder.getTags() : Promise.resolve(this.event?.tags ?? [])
  }

  // The author's pubkey when known; a builder isn't signed yet, so undefined.
  protected getAuthor(): string | undefined {
    return this.event?.pubkey || undefined
  }

  // The pre-mutation reader, when routing from a builder seeded with one.
  protected getReader(): R | undefined {
    return this.builder?.reader
  }

  // The author's outbox — where the event lives. Targets the known author, or the
  // current user when routing a builder (not yet signed).
  protected authorRoute(): RelaySelection {
    const author = this.getAuthor()

    return author ? outbox(author) : userOutbox()
  }

  // Deliver to the inbox of every other pubkey the event p-tags (mentions/recipients).
  protected mentionRoutes(tags: string[][], weight = 0.5): RelaySelection[] {
    const author = this.getAuthor()

    return uniq(getPubkeyTagValues(tags))
      .filter(pubkey => pubkey !== author)
      .map(pubkey => inbox(pubkey, weight))
  }

  // A NIP-29 group publish (builder.setGroup) goes only to the group's relay.
  // Returns that route when set, so subclasses can short-circuit their usual logic.
  protected groupRoutes(): RelaySelection[] | undefined {
    const url = this.builder?.groupUrl

    return url ? [relayHint(url)] : undefined
  }
}

// Publishes only to the author's outbox — for events whose tags are data, not
// delivery targets (most replaceable/addressable kinds: lists, profiles, metadata).
export class OutboxRouter extends EventRouter {
  async routes(): Promise<RelaySelection[]> {
    return this.groupRoutes() ?? [this.authorRoute()]
  }
}

// Like OutboxRouter, plus indexer relays (profiles, follow/relay lists).
export class IndexedRouter extends EventRouter {
  async routes(): Promise<RelaySelection[]> {
    return this.groupRoutes() ?? [this.authorRoute(), indexers()]
  }
}

// The author's outbox plus the inboxes of the pubkeys the event references — for
// regular content that mentions or replies to others. (Tag relay hints are NOT
// publish targets: they tell a reader where to find the referenced event, not
// where to deliver this one.)
export class ContentRouter extends EventRouter {
  async routes(): Promise<RelaySelection[]> {
    const group = this.groupRoutes()

    if (group) return group

    const tags = await this.getTags()

    return [this.authorRoute(), ...this.mentionRoutes(tags)]
  }
}
