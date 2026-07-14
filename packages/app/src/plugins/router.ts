import {uniq} from "@welshman/lib"
import {Resolver, Address, isReplaceableKind} from "@welshman/util"
import type {RelayRoute, RelaySelection, EventRef} from "@welshman/util"
import type {FeedRouter} from "@welshman/feeds"
import {RelayLists} from "./relayLists.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import {RelayStats} from "./relayStats.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * The app's relay router. Reach it via `app.use(Router)`.
 *
 * `resolve(selections)` turns the declarative `RelaySelection` DSL (from
 * `@welshman/util`) into a scored `RelayScenario`. `resolver` turns a single
 * declarative route into concrete urls (the domain kinds' resolver, injected via
 * `app.use(Domain)`).
 */
export class Router implements FeedRouter {
  resolver: Resolver

  constructor(readonly app: IApp) {
    this.resolver = new Resolver(this.resolveRoute, {
      getRelayQuality: url => this.app.use(RelayStats).getQuality(url),
      getDefaultRelays: this.app.config.getDefaultRelays,
    })
  }

  // Resolve selections into a scored `RelayScenario`
  resolve = (selections: RelaySelection[]) => this.resolver.scenario(selections)

  // Resolve a single route into concrete relay urls.
  resolveRoute = (route: RelayRoute) => {
    switch (route.type) {
      case "userInbox":
        return this.inboxRelays(User.require(this.app).pubkey)
      case "userOutbox":
        return this.outboxRelays(User.require(this.app).pubkey)
      case "userMessaging":
        return this.messagingRelays(User.require(this.app).pubkey)
      case "pubkeyInbox":
        return this.inboxRelays(route.pubkey)
      case "pubkeyOutbox":
        return this.outboxRelays(route.pubkey)
      case "pubkeyMessaging":
        return this.messagingRelays(route.pubkey)
      case "eventInbox":
        return this.resolveEvent(route.ref, this.inboxRelays)
      case "eventOutbox":
        return this.resolveEvent(route.ref, this.outboxRelays)
      case "seen":
        return this.resolveSeen(route.ref)
      case "index":
        return this.app.config.getIndexerRelays?.() ?? []
      case "search":
        return this.app.config.getSearchRelays?.() ?? []
      case "relay":
        return [route.url]
    }
  }

  // A pubkey's read relays (its inbox — where to deliver so it receives events).
  private inboxRelays = async (pubkey?: string) =>
    pubkey ? ((await this.app.use(RelayLists).load(pubkey))?.readUrls() ?? []) : []

  // A pubkey's write relays (its outbox — where its events live).
  private outboxRelays = async (pubkey?: string) =>
    pubkey ? ((await this.app.use(RelayLists).load(pubkey))?.writeUrls() ?? []) : []

  // A pubkey's NIP-17 messaging relays.
  private messagingRelays = async (pubkey?: string) =>
    pubkey ? ((await this.app.use(MessagingRelayLists).load(pubkey))?.urls() ?? []) : []

  // Resolve an event reference to a pubkey's relays: route directly to a known
  // pubkey, else look the event up in the repository to find its author, else fall
  // back to any relay hints on the reference.
  private resolveEvent = async (
    ref: EventRef,
    getRelays: (pubkey?: string) => Promise<string[]>,
  ) => {
    const relays = ref.relays ? [...ref.relays] : []

    if (ref.pubkey) {
      relays.push(...(await getRelays(ref.pubkey)))
    }

    if (ref.id) {
      const event = this.app.repository.getEvent(ref.id)

      if (event) {
        relays.push(...(await getRelays(event.pubkey)))
      }
    }

    return uniq(relays)
  }

  // Relays an event was found on: the tracker's record (keyed by event id) plus
  // any relay hints carried on the reference.
  private resolveSeen = (ref: EventRef) => {
    const relays = ref.relays ? [...ref.relays] : []

    if (ref.id) {
      relays.push(...this.app.tracker.getRelays(ref.id))
    } else if (ref.pubkey && ref.kind !== undefined && isReplaceableKind(ref.kind)) {
      const address = new Address(ref.kind, ref.pubkey, ref.identifier ?? "").toString()
      const event = this.app.repository.getEvent(address)

      if (event) {
        relays.push(...this.app.tracker.getRelays(event.id))
      }
    }

    return relays
  }
}
