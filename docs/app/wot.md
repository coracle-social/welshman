# Web of Trust

`app.use(Wot)` maintains a graph of who follows and mutes whom, built from the public tags on follow (kind 3) and mute (kind 10000) lists as they land in the repository.

A list arriving rewrites only its author's edges, and every read is a lookup. `.get()` is current as soon as an event lands. Subscribers are notified on a 300ms throttle, so a burst of lists wakes them once per interval.

A mute list's private entries are encrypted to their author, so they are not part of the graph.

## Scope

Every read about a pubkey from the outside (who follows it, who mutes it, what it scores) takes an explicit `WotScope`:

```typescript
enum WotScope {
  Global = "global",   // count every list in the repository
  Follows = "follows", // count only what the current user's follows published
}
```

`Follows` asks how the user sees the pubkey. `Global` measures reach across the whole repository.

The user's follow list is part of the same graph, so a `Follows` read picks up a new follow on the next notification without re-subscribing. With no signed-in user, a `Follows` read counts globally.

## Reads

Each returns a [`Projection`](./plugins#projection-t) (`.get()` / `.$`) and re-derives when the graph changes:

```typescript
const wot = app.use(Wot)

wot.follows(target)                  // Projection<string[]> — who target follows
wot.mutes(target)                    // Projection<string[]> — who target mutes
wot.followers(target, scope)         // Projection<string[]> — who follows target
wot.muters(target, scope)            // Projection<string[]> — who mutes target
wot.score(target, scope)             // Projection<number> — followers minus muters
wot.network(target)                  // Projection<string[]> — follows-of-follows (minus direct follows)
wot.scores(scope)                    // Projection<Map<string, number>> — every score at once
```

`follows` and `mutes` read a pubkey's own list, so they take no scope.

`scores` suits callers that need every score at once, such as ranking a page of results, rather than a projection per pubkey.

## Examples

```typescript
import {Wot, WotScope} from "@welshman/app"

const wot = app.use(Wot)

// Reactive trust score, as this user sees it
const score$ = wot.score(theirPubkey, WotScope.Follows).$

// Which of the people I follow follow them, and which mute them
const vouching = wot.followers(theirPubkey, WotScope.Follows).get()
const warning = wot.muters(theirPubkey, WotScope.Follows).get()

// Sort a list of pubkeys by trust, descending
const $scores = wot.scores(WotScope.Follows).get()
const sorted = [...pubkeys].sort((a, b) => ($scores.get(b) ?? 0) - ($scores.get(a) ?? 0))

// How many people in the whole repository follow them
const reach = wot.followers(theirPubkey, WotScope.Global).get().length

// Discover the extended network for a "follows of follows" feed
const network = wot.network(myPubkey).get()
```

The graph also feeds [profile search](./feeds-and-search#search) ranking and the `Scope`/score-range pubkey resolution used by [feeds](./feeds-and-search#feeds).
