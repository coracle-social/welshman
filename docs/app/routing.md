# Routing & Tags

## The Router

`app.use(Router)` is a per-app `Router` (from `@welshman/router`) wired to this app's data. It is the single source for relay selection — there is no global `Router.get()` anymore; one router belongs to each app.

The app wires it up with:

- **user pubkey** from `app.user`
- **read/write relays** per pubkey from [`RelayLists`](./data#relay-lists)
- **relay quality** from [`RelayStats`](#relay-quality)
- **default / indexer / search relays** from [`AppConfig`](./appappconfig)

### Relay-selection scenes

The router exposes composable "scenes" (inherited from the base router) that resolve to a relay set:

```typescript
const router = app.use(Router)

router.FromUser()              // the current user's relays
router.FromPubkey(pubkey)      // another user's relays
router.FromRelays(urls)        // explicit relays
router.Event(event)            // relays where an event is likely found
router.EventRoots(event)       // relays for an event's thread roots
router.Search()                // search relays
```

Scenes are chainable and terminate in `getUrls()` / `getUrl()`:

```typescript
import {addMinimalFallbacks} from "@welshman/router"

const relays = router.FromUser().policy(addMinimalFallbacks).limit(8).getUrls()
const hint = router.Event(event).getUrl()
```

## Relay quality

`app.use(RelayStats)` collects per-relay connection statistics (open/close/publish/request/event counts, timestamps, recent errors) and exposes a quality score the router uses to rank relays.

```typescript
const stats = app.use(RelayStats)

stats.one(url)                 // Readable<Maybe<RelayStatsItem>>
stats.getQuality(url)          // number in [0, 1] — 0 for blocked/error-prone relays
```

Stats are populated automatically by the [`appPolicyRelayStats`](./apppolicies) default policy. `getQuality` returns `0` for non-relay URLs, relays in the user's [blocked list](./data#specialized-relay-lists), or error-prone relays, and higher scores for relays that are connected or have been seen before.

## Tag utilities

`app.use(Tags)` builds nostr tags using the router for relay hints, `Profiles` for display names, and the current user to avoid self-tagging.

```typescript
const tags = app.use(Tags)

tags.tagPubkey(pubkey)                    // ["p", pubkey, hint, name]
tags.tagEvent(event, url?, mark?)         // [["e", id, hint, mark, pubkey], ("a", ...)? ]
tags.tagEventPubkeys(event)               // de-duped p-tags (author + mentions, minus self)
tags.tagZapSplit(pubkey, split?)          // ["zap", pubkey, hint, split]

tags.tagEventForReply(event, relay?)      // reply tag set (root/reply e/a + p tags)
tags.tagEventForComment(event, relay?)    // NIP-22 comment tags (K/E/A/I/P + k/p/e)
tags.tagEventForQuote(event, relay?)      // ["q", id, hint, pubkey]
tags.tagEventForReaction(event, relay?)   // p, ["k", kind], ["e", id, hint], ("a", ...)?
```

A typical reply:

```typescript
import {makeEvent, NOTE} from "@welshman/util"

const replyTags = app.use(Tags).tagEventForReply(parentEvent)

app.use(Thunks).publish({
  event: makeEvent(NOTE, {content: "well said", tags: replyTags}),
  relays: app.use(Router).FromUser().getUrls(),
})
```
