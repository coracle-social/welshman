import {resolve, addMinimalFallbacks} from "@welshman/util"
import type {
  RelayRoute,
  RelaySelection,
  RelayScenario,
  RelayScenarioOptions,
  EventRef,
} from "@welshman/util"
import type {FeedRouter} from "@welshman/feeds"
import type {EventBuilder, EventReader} from "@welshman/domain"
import {RelayLists} from "./relayLists.js"
import {MessagingRelayLists} from "./messagingRelayLists.js"
import {RelayStats} from "./relayStats.js"
import {Command} from "../command.js"
import {User} from "../user.js"
import type {IApp} from "../app.js"

/**
 * The app's relay router. Reach it via `app.use(Router)`.
 *
 * `resolve(selections)` turns the declarative `RelaySelection` DSL (from
 * `@welshman/util`) into a scored `RelayScenario`.
 */
export class Router implements FeedRouter {
  constructor(readonly app: IApp) {}

  // Turn a single declarative route into concrete relay urls.
  resolveRoute = (route: RelayRoute): Promise<string[]> => {
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
        return Promise.resolve(this.seenRelays(route.ref))
      case "relay":
        return Promise.resolve([route.url])
      case "index":
        return Promise.resolve(this.app.config.getIndexerRelays?.() ?? [])
      case "search":
        return Promise.resolve(this.app.config.getSearchRelays?.() ?? [])
    }
  }

  // Relays the event was found on: the tracker's record (keyed by event id) plus
  // any relay hints carried on the reference.
  private seenRelays = (ref: EventRef): string[] => [
    ...(ref.id ? Array.from(this.app.tracker.getRelays(ref.id)) : []),
    ...(ref.relays ?? []),
  ]

  // A pubkey's read relays (its inbox — where to deliver so it receives events).
  private inboxRelays = async (pubkey?: string): Promise<string[]> =>
    pubkey ? ((await this.app.use(RelayLists).load(pubkey))?.readUrls() ?? []) : []

  // A pubkey's write relays (its outbox — where its events live).
  private outboxRelays = async (pubkey?: string): Promise<string[]> =>
    pubkey ? ((await this.app.use(RelayLists).load(pubkey))?.writeUrls() ?? []) : []

  // A pubkey's NIP-17 messaging relays.
  private messagingRelays = async (pubkey?: string): Promise<string[]> =>
    pubkey ? ((await this.app.use(MessagingRelayLists).load(pubkey))?.urls() ?? []) : []

  private resolveEvent = async (
    ref: EventRef,
    getRelays: (pubkey?: string) => Promise<string[]>,
  ): Promise<string[]> => {
    if (ref.pubkey) {
      return getRelays(ref.pubkey)
    }

    if (ref.id) {
      const event = this.app.repository.getEvent(ref.id)

      if (event) {
        return getRelays(event.pubkey)
      }
    }

    return ref.relays ?? []
  }

  // The ambient scoring inputs — relay quality and default relays.
  private scenarioOptions = (): RelayScenarioOptions => ({
    policy: addMinimalFallbacks,
    getRelayQuality: url => this.app.use(RelayStats).getQuality(url),
    getDefaultRelays: this.app.config.getDefaultRelays,
  })

  // Resolve selections into a scored `RelayScenario`
  resolve = (selections: RelaySelection[]): Promise<RelayScenario> =>
    resolve(selections, this.resolveRoute, this.scenarioOptions())

  // The common publish path in one call: build the event (signed by the required
  // app user), derive its routes via the builder, resolve them, and return a
  // `Command`. Scenarios default to no fallback relays — a publish goes exactly
  // where the event's routes resolve (e.g. a NIP-29 group event to its one relay).
  // `configure` tunes the publish scenario, e.g. `scenario => scenario.limit(30)`.
  commandFromBuilder = async <R extends EventReader>(
    builder: EventBuilder<R>,
    configure: (scenario: RelayScenario) => RelayScenario = scenario => scenario,
  ): Promise<Command> => {
    const user = User.require(this.app)
    const template = await builder.toTemplate(user.signer)
    const routes = await builder.routes()
    const scenario = configure(await this.resolve(routes))

    return new Command(this.app, template, scenario.getUrls())
  }
}
