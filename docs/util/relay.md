# Relay

The `Relay` module provides utilities for working with Nostr relay URLs — normalization, validation, and classification.

NIP-11 relay information documents are modeled by the `Relay` class in `@welshman/domain`, which owns the profile display (`relay.display`) and capability checks (`relay.hasNegentropy`, `relay.hasNip`). `relay.displayUrl()` delegates to `displayRelayUrl` below.

## API

### Types and Enums

```typescript
// Relay operation modes
export enum RelayMode {
  Read = "read",
  Write = "write",
  Search = "search",
  Blocked = "blocked",
  Messaging = "messaging"
}
```

### URL Validation

```typescript
// Check if URL is a valid relay URL
export declare const isRelayUrl: (url: string) => boolean;

// Check if URL is an onion (Tor) address
export declare const isOnionUrl: (url: string) => boolean;

// Check if URL is a local address
export declare const isLocalUrl: (url: string) => boolean;

// Check if URL contains an IP address
export declare const isIPAddress: (url: string) => boolean;

// Check if URL is safe to share publicly
export declare const isShareableRelayUrl: (url: string) => boolean;
```

### URL Normalization

```typescript
// Normalize relay URL to standard format
export declare const normalizeRelayUrl: (url: string) => string;

// Format URL for display (strip protocol + trailing slash)
export declare const displayRelayUrl: (url: string) => string;
```

## Relay Selection DSL

A `RelaySelection` is a *declarative* description of which relays an operation
wants — not a list of urls. It names sources ("the author's outbox", "this
pubkey's inbox", "the relays this event was seen on") that can only be turned
into concrete urls in a context where the necessary data is available (relay
lists, the tracker, the network to load a referenced event). Domain code
produces selections from an event; a `Resolver` turns them into urls.

### Route types

```typescript
// A reference to an event we route relative to (e.g. to reach its author). Every
// field is optional and additive: a known `pubkey` lets us route directly; `id`
// or `kind`+`pubkey`+`identifier` let the resolver look the event up; `relays`
// are hints for that lookup and a last-resort routing fallback.
export type EventRef = {
  id?: string;
  pubkey?: string;
  kind?: number;
  identifier?: string;
  relays?: string[];
};

export type RelayRoute =
  // The current user's inbox (read), outbox (write), or messaging relays.
  | {type: "userInbox"}
  | {type: "userOutbox"}
  | {type: "userMessaging"}
  // A specific pubkey's inbox (read), outbox (write), or messaging relays.
  | {type: "pubkeyInbox"; pubkey: string}
  | {type: "pubkeyOutbox"; pubkey: string}
  | {type: "pubkeyMessaging"; pubkey: string}
  // The author of a referenced event — the resolver finds the event first.
  | {type: "eventInbox"; ref: EventRef}
  | {type: "eventOutbox"; ref: EventRef}
  // The relays a given event was found on.
  | {type: "seen"; ref: EventRef}
  // A literal relay url (e.g. a hint embedded in a tag, or a group relay).
  | {type: "relay"; url: string}
  // Relays that index profiles/relay-lists.
  | {type: "index"}
  // Relays configured for full-text search.
  | {type: "search"};

export type RelaySelection = {
  route: RelayRoute;
  weight: number;
};
```

### DSL constructors

Each constructor returns a `RelaySelection` (default `weight = 1`), except
`relays` and `inboxes`, which return `RelaySelection[]` (spread them with `...`
into a route list).

```typescript
export declare const inbox: (pubkey: string, weight?: number) => RelaySelection;
export declare const outbox: (pubkey: string, weight?: number) => RelaySelection;
export declare const messaging: (pubkey: string, weight?: number) => RelaySelection;

export declare const userInbox: (weight?: number) => RelaySelection;
export declare const userOutbox: (weight?: number) => RelaySelection;
export declare const userMessaging: (weight?: number) => RelaySelection;

export declare const eventInbox: (ref: EventRef, weight?: number) => RelaySelection;
export declare const eventOutbox: (ref: EventRef, weight?: number) => RelaySelection;

// Relays the given event was found on (its tracker relays plus any ref hints).
export declare const seen: (ref: EventRef, weight?: number) => RelaySelection;

// A literal relay url (renamed from the old `relayHint`).
export declare const relay: (url: string, weight?: number) => RelaySelection;

// One `relay` selection per url (renamed from the old `relayHints`).
export declare const relays: (urls: string[], weight?: number) => RelaySelection[];

// Inbox selections for a set of pubkeys (mentions/recipients); dedupes pubkeys.
export declare const inboxes: (pubkeys: string[], weight?: number) => RelaySelection[];

export declare const indexers: (weight?: number) => RelaySelection;
export declare const searchRelays: (weight?: number) => RelaySelection;
```

Example — deliver the user's note to their own outbox plus every mentioned
pubkey's inbox at half weight:

```typescript
const selections = [userOutbox(), ...inboxes(mentionedPubkeys, 0.5)];
```

## RelayScenario

A `RelayScenario` scores a set of resolved, weighted relay sets and picks the
best concrete urls, optionally topping up with fallback (default) relays.

```typescript
// A concrete, resolved weighted relay set.
export type Selection = {
  weight: number;
  relays: string[];
};

// Filters to valid relay urls and normalizes them.
export declare const makeSelection: (relays: string[], weight?: number) => Selection;

// Fallback policies decide how many default relays to add.
export type FallbackPolicy = (count: number, limit: number) => number;
export declare const addNoFallbacks: FallbackPolicy;      // never add fallbacks
export declare const addMinimalFallbacks: FallbackPolicy; // add 1 only if none found
export declare const addMaximalFallbacks: FallbackPolicy; // fill up to the limit

export type RelayScenarioOptions = {
  policy?: FallbackPolicy;
  limit?: number;
  allowLocal?: boolean;
  allowOnion?: boolean;
  allowInsecure?: boolean;
  getRelayQuality?: (url: string) => number;
  getDefaultRelays?: () => string[];
};

export declare class RelayScenario {
  constructor(selections: Selection[], options?: RelayScenarioOptions);

  // Chainable — each returns a new scenario with merged options.
  clone(options: RelayScenarioOptions): RelayScenario;
  limit(limit: number): RelayScenario;
  policy(policy: FallbackPolicy): RelayScenario;
  allowLocal(allowLocal: boolean): RelayScenario;
  allowOnion(allowOnion: boolean): RelayScenario;
  allowInsecure(allowInsecure: boolean): RelayScenario;

  getLimit(): number;   // options.limit || 3
  getPolicy(): FallbackPolicy;  // options.policy || addNoFallbacks

  // Accumulates weight per relay across selections (filtering onion/local/insecure
  // ws:// unless allowed), scores by quality and weight with some randomness, takes
  // the best `limit`, then tops up with shuffled default relays per the policy.
  getUrls(): string[];
  getUrl(): string | undefined;  // first of getUrls()
}
```

## Resolver

A `Resolver` combines a single route-resolver function with bound scenario
options. It dereferences each route to urls and builds scenarios from
selections. This replaces the old standalone `resolve()` function.

```typescript
export type ResolveRoute = (route: RelayRoute) => MaybeAsync<string[]>;

export declare class Resolver {
  constructor(routeResolver: ResolveRoute, options?: RelayScenarioOptions);

  // Resolve each route and build a scenario bound to this resolver's options.
  scenario(selections: RelaySelection[]): Promise<RelayScenario>;

  // Convenience wrappers.
  relays(selections: RelaySelection[]): Promise<string[]>;       // scenario(...).getUrls()
  relay(selections: RelaySelection[]): Promise<string | undefined>; // scenario(...).getUrl()
}
```

Example — build a resolver and route to a set of selections:

```typescript
const resolver = new Resolver(resolveRoute, {
  getRelayQuality,
  getDefaultRelays,
});

const scenario = await resolver.scenario([userOutbox(), ...inboxes(pubkeys, 0.5)]);
const urls = scenario.limit(5).getUrls();

// Or skip the scenario for the common cases:
const urls2 = await resolver.relays([outbox(pubkey)]);
const url = await resolver.relay([relay(hintUrl), outbox(pubkey)]);
```

In `@welshman/app`, the `Router` plugin exposes a `Resolver` (`app.use(Router).resolver`)
built with `getRelayQuality`/`getDefaultRelays` from app config, and this is the
resolver injected into every domain kind via `Domain.configure`.
