# Web of Trust

`app.use(Wot)` maintains a graph of who follows and mutes whom, built from the public tags on follow (kind 3) and mute (kind 10000) lists as they land in the repository.

A list arriving rewrites its author's edges on the spot, so an update costs the one list that changed — not a walk of the whole graph — and every read is a lookup. `.get()` is current the moment an event lands; subscribers are notified on a debounce, so a burst of lists wakes them once.

A mute list's private entries are encrypted to their author, so they're no part of the graph.

## Scope

Every read that asks about a pubkey from the outside — who follows it, who mutes it, what it scores — takes a `WotScope`, and takes it explicitly:

```typescript
enum WotScope {
  Global = "global",   // count every list in the repository
  Follows = "follows", // count only what the current user's follows published
}
```

`Follows` is the usual web-of-trust question: the pubkey as the user sees it. `Global` is reach — how the whole network treats them.

The user's follow list is part of the same graph, so a `Follows` read tracks it changing like it tracks anything else: follow someone new and the reads pick their edges up on the next notification, with nothing to re-pass or re-subscribe. With no signed-in user there's nothing to narrow by, so a `Follows` read answers globally.

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

`follows` and `mutes` read a pubkey's own list, so they take no scope — the list is the pubkey's own claim either way.

`scores` is for the callers that need the whole picture (ranking a page of results, resolving a score range) rather than a projection per pubkey.

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
