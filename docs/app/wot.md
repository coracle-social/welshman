# Web of Trust

`app.use(Wot)` computes a web-of-trust graph from follow ([`FollowLists`](./data#follows)) and mute ([`MuteLists`](./data#mutes)) lists, rooted at the current user. When there is no signed-in user, the graph is built from the union of all known follow lists. All computations are throttled (1s) to stay cheap under churn.

The score for a pubkey is the number of roots that follow it minus the number that mute it.

## Aggregate projections

Each returns a [`Projection`](./plugins#projection-t) (`.get()` / `.$`):

```typescript
const wot = app.use(Wot)

wot.graph                      // Projection<Map<string, number>> — score per pubkey
wot.max                        // Projection<number | undefined> — highest score in the graph
wot.followersByPubkey          // Projection<Map<string, Set<string>>>
wot.mutersByPubkey             // Projection<Map<string, Set<string>>>
```

## Per-pubkey queries

```typescript
wot.follows(pubkey)                       // Projection<string[]> — who pubkey follows
wot.mutes(pubkey)                         // Projection<string[]> — who pubkey mutes
wot.followers(pubkey)                     // Projection<string[]> — who follows pubkey
wot.muters(pubkey)                        // Projection<string[]> — who mutes pubkey
wot.network(pubkey)                       // Projection<string[]> — follows-of-follows (minus direct follows)

wot.followsWhoFollow(pubkey, target)      // Projection<string[]>
wot.followsWhoMute(pubkey, target)        // Projection<string[]>
wot.wotScore(pubkey, target)              // Projection<number>
```

`wotScore(pubkey, target)`:

- With a `pubkey`: `(pubkey's follows who follow target) − (pubkey's follows who mute target)`.
- Without a `pubkey`: `followers(target).length − muters(target).length`.

## Examples

```typescript
const wot = app.use(Wot)

// Sort a list of pubkeys by trust, descending
const graph = wot.graph.get()
const sorted = [...pubkeys].sort((a, b) => (graph.get(b) ?? 0) - (graph.get(a) ?? 0))

// Reactive trust score between me and someone else
const score$ = wot.wotScore(myPubkey, theirPubkey).$

// Discover the extended network for a "follows of follows" feed
const network = wot.network(myPubkey).get()
```

The WoT graph also feeds [profile search](./feeds-and-search#search) ranking and the `Scope`/WoT-range pubkey resolution used by [feeds](./feeds-and-search#feeds).
