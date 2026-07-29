---
name: welshman-util
description: "Use this skill when working with @welshman/util: nostr event types, kinds, tags, filters, addresses, NIPs (42/86/98), relays, zaps, wallets, or any core nostr data structures. (Profiles, lists, handlers, and rooms now live in @welshman/domain as Reader/Writer classes.)"
---

# welshman/util — Core Nostr Utilities

`@welshman/util` is the foundational layer of the welshman nostr stack, providing types, constants, and helpers for every nostr primitive: events, kinds, tags, filters, addresses, zaps, relays, and Lightning wallet integration. Higher level welshman packages (`@welshman/net`, `@welshman/app`, `@welshman/store`, etc.) depend on the types and utilities defined here.

## Installation

```bash
npm install @welshman/util
# or
pnpm add @welshman/util
# or
yarn add @welshman/util
```

---

## Key Exports

### Event Types

| Type | Description |
|------|-------------|
| `EventContent` | `{ tags, content }` — base content structure |
| `EventTemplate` | `EventContent + kind` |
| `StampedEvent` | `EventTemplate + created_at` |
| `OwnedEvent` | `StampedEvent + pubkey` |
| `HashedEvent` | `OwnedEvent + id` |
| `SignedEvent` | `HashedEvent + sig` |
| `TrustedEvent` | `HashedEvent + optional sig` — most common in-app type |

### Event Utilities

| Export | Description |
|--------|-------------|
| `verifiedSymbol` | Symbol (re-exported from `nostr-tools`) used as a key on events; set `event[verifiedSymbol] = true` to skip signature re-validation |
| `makeEvent(kind, opts?)` | Create a `StampedEvent` with optional content, tags, created_at |
| `verifyEvent(event)` | Verify event signature; returns `false` for unsigned events (no `sig` field) even if `verifiedSymbol` is set, because `isSignedEvent` is checked first; returns `true` immediately for signed events where `event[verifiedSymbol]` is already set |
| `getIdentifier(event)` | Get `d` tag value |
| `getIdOrAddress(event)` | Returns address string for replaceable events, id otherwise |
| `getIdAndAddress(event)` | Returns array with both id and address (if applicable) |
| `deduplicateEvents(events)` | Deduplicate by id or address |
| `isEphemeral(event)` | True for ephemeral kinds (20000–29999) |
| `isReplaceable(event)` | True for plain or parameterized replaceable |
| `isPlainReplaceable(event)` | True for kinds 10000–19999 and metadata/contacts |
| `isParameterizedReplaceable(event)` | True for kinds 30000–39999 |
| `getAncestors(event)` | Returns `{ roots, replies, mentions }` for NIP-10 events (mentions may be empty `[]` but is always present); NIP-22/COMMENT path returns `{ roots, replies }` without mentions |
| `getParentIdOrAddr(event)` | Immediate parent id or address |
| `isChildOf(child, parent)` | Check if child replies to parent |

### Type Guards

`isEventTemplate`, `isStampedEvent`, `isOwnedEvent`, `isHashedEvent`, `isSignedEvent`

### Event Kinds (constants)

All constants are exported by name from `@welshman/util`.

**Core / NIP-01**

```
PROFILE = 0            NOTE = 1              FOLLOWS = 3
DELETE = 5             REPOST = 6            REACTION = 7
BADGE_AWARD = 8        MESSAGE = 9           THREAD = 11
SEAL = 13              DIRECT_MESSAGE = 14   DIRECT_MESSAGE_FILE = 15
GENERIC_REPOST = 16    PICTURE_NOTE = 20     VANISH = 62
COMMENT = 1111         GENERIC_REPOST = 16
```

**Channels (NIP-28)**

```
CHANNEL_CREATE = 40    CHANNEL_UPDATE = 41   CHANNEL_MESSAGE = 42
CHANNEL_HIDE_MESSAGE = 43                    CHANNEL_MUTE_USER = 44
```

**Wrapped / encrypted (NIP-59)**

```
WRAP = 1059            WRAP_NIP04 = 1060
WRAPPED_KINDS = [DIRECT_MESSAGE, DIRECT_MESSAGE_FILE]   // convenience array
```

**Media / files**

```
FILE_METADATA = 1063   PICTURE_NOTE = 20     AUDIO = 31337
```

**Polls**

```
POLL = 1068            POLL_RESPONSE = 1018
```

**Marketplace / auction**

```
BID = 1021             BID_CONFIRMATION = 1022
STALL = 30017          PRODUCT = 30018       MARKET_UI = 30019
PRODUCT_SOLD_AS_AUCTION = 30020
CLASSIFIED = 30402     DRAFT_CLASSIFIED = 30403
```

**Git (NIP-34)**

```
GIT_PATCH = 1617       GIT_ISSUE = 1621      GIT_REPLY = 1622
GIT_STATUS_OPEN = 1630 GIT_STATUS_COMPLETE = 1631
GIT_STATUS_CLOSED = 1632                     GIT_STATUS_DRAFT = 1633
GIT_REPOSITORY = 30403
```

**Social / community**

```
REMIX = 1808           REPORT = 1984         LABEL = 1985
REVIEW = 1986          HIGHLIGHT = 9802      APPROVAL = 4550
NOSTROCKET_PROBLEM = 1971
COMMUNITY = 34550
BADGE_DEFINITION = 30009   BADGES = 30008
LIVE_EVENT = 30311     LIVE_CHAT_MESSAGE = 1311
```

**Rooms (NIP-29)**

```
ROOM_CREATE = 9007     ROOM_DELETE = 9008    ROOM = 35834
ROOM_JOIN = 9021       ROOM_LEAVE = 9022     ROOM_META = 39000
ROOM_ADMINS = 39001    ROOM_MEMBERS = 39002  ROOM_EDIT_META = 9002
ROOM_ADD_MEMBER = 9000 ROOM_REMOVE_MEMBER = 9001
ROOM_ADD_PERM = 9003   ROOM_REMOVE_PERM = 9004
ROOM_DELETE_EVENT = 9005                     ROOM_EDIT_STATUS = 9006
ROOM_CREATE_PERMISSION = 19004
RELAY_MEMBERS = 13534  RELAY_ADD_MEMBER = 8000   RELAY_REMOVE_MEMBER = 8001
RELAY_JOIN = 28934     RELAY_INVITE = 28935      RELAY_LEAVE = 28936
```

**Replaceable lists (kinds 10000–10099)**

```
MUTES = 10000          PINS = 10001          RELAYS = 10002
BOOKMARKS = 10003      COMMUNITIES = 10004   CHANNELS = 10005
BLOCKED_RELAYS = 10006 SEARCH_RELAYS = 10007 ROOMS = 10009
FEEDS = 10014          TOPICS = 10015        EMOJIS = 10030
MESSAGING_RELAYS = 10050                     BLOSSOM_SERVERS = 10063
FILE_SERVERS = 10096
```

**Parameterized replaceable lists (kinds 30000–30102)**

```
NAMED_PEOPLE = 30000   NAMED_RELAYS = 30002  NAMED_BOOKMARKS = 30003
NAMED_CURATIONS = 30004                      NAMED_TOPICS = 30015
NAMED_WIKI_AUTHORS = 30101                   NAMED_WIKI_RELAYS = 30102
NAMED_EMOJIS = 30030   NAMED_ARTIFACTS = 30063
NAMED_COMMUNITIES = 30064
```

**Long-form / wiki / publishing (NIP-23)**

```
LONG_FORM = 30023      LONG_FORM_DRAFT = 30024
WIKI = 30818           APP_DATA = 30078
FEED = 31890
```

**Calendar (NIP-52)**

```
CALENDAR = 31924       EVENT_DATE = 31922    EVENT_TIME = 31923
EVENT_RSVP = 31925
```

**Handlers (NIP-89)**

```
HANDLER_INFORMATION = 31990   HANDLER_RECOMMENDATION = 31989
```

**Status / alerts**

```
STATUS = 30315
ALERT_EMAIL = 32830    ALERT_STATUS = 32831  ALERT_WEB = 32832
ALERT_ANDROID = 32833  ALERT_IOS = 32834
```

**Zaps / wallet / Lightning**

```
ZAP_GOAL = 9041        ZAP_REQUEST = 9734    ZAP_RESPONSE = 9735
WALLET_INFO = 13194    WALLET_REQUEST = 23194 WALLET_RESPONSE = 23195
LIGHTNING_PUB_RPC = 21000
OTS = 1040
```

**Auth**

```
CLIENT_AUTH = 22242    BLOSSOM_AUTH = 24242  HTTP_AUTH = 27235
NOSTR_CONNECT = 24133
```

**Follow packs**

```
FOLLOW_PACK = 39089
```

**Promenade protocol**

```
PROMENADE_REGISTER_ACCOUNT = 16430   PROMENADE_SHARD_SHARE = 26428
PROMENADE_SHARD_ACK = 26429          PROMENADE_CONFIG = 26430
PROMENADE_COMMIT = 26431             PROMENADE_REQUEST = 26432
PROMENADE_RESULT = 26433
```

**Deprecated**

```
DEPRECATED_RELAY_RECOMMENDATION = 2
DEPRECATED_DIRECT_MESSAGE = 4
DEPRECATED_NAMED_GENERIC = 30001
```

**DVM — Data Vending Machines (NIP-90, kinds 5000–7000)**

Requests (`5xxx`) and their paired responses (`6xxx`):

```
DVM_REQUEST_TEXT_EXTRACTION = 5000     DVM_RESPONSE_TEXT_EXTRACTION = 6000
DVM_REQUEST_TEXT_SUMMARY = 5001        DVM_RESPONSE_TEXT_SUMMARY = 6001
DVM_REQUEST_TEXT_TRANSLATION = 5002    DVM_RESPONSE_TEXT_TRANSLATION = 6002
DVM_REQUEST_TEXT_GENERATION = 5050     DVM_RESPONSE_TEXT_GENERATION = 6050
DVM_REQUEST_IMAGE_GENERATION = 5100    DVM_RESPONSE_IMAGE_GENERATION = 6100
DVM_REQUEST_VIDEO_CONVERSION = 5200    DVM_RESPONSE_VIDEO_CONVERSION = 6200
DVM_REQUEST_VIDEO_TRANSLATION = 5201   DVM_RESPONSE_VIDEO_TRANSLATION = 6201
DVM_REQUEST_IMAGE_TO_VIDEO_CONVERSION = 5202
DVM_RESPONSE_IMAGE_TO_VIDEO_CONVERSION = 6202
DVM_REQUEST_TEXT_TO_SPEECH = 5250      DVM_RESPONSE_TEXT_TO_SPEECH = 6250
DVM_REQUEST_DISCOVER_CONTENT = 5300    DVM_RESPONSE_DISCOVER_CONTENT = 6300
DVM_REQUEST_DISCOVER_PEOPLE = 5301     DVM_RESPONSE_DISCOVER_PEOPLE = 6301
DVM_REQUEST_SEARCH_CONTENT = 5302      DVM_RESPONSE_SEARCH_CONTENT = 6302
DVM_REQUEST_SEARCH_PEOPLE = 5303       DVM_RESPONSE_SEARCH_PEOPLE = 6303
DVM_REQUEST_COUNT = 5400               DVM_RESPONSE_COUNT = 6400
DVM_REQUEST_MALWARE_SCAN = 5500        DVM_RESPONSE_MALWARE_SCAN = 6500
DVM_REQUEST_OTS = 5900                 DVM_RESPONSE_OTS = 6900
DVM_REQUEST_OP_RETURN = 5901           DVM_RESPONSE_OP_RETURN = 6901
DVM_REQUEST_PUBLISH_SCHEDULE = 5905    DVM_RESPONSE_PUBLISH_SCHEDULE = 6905
DVM_FEEDBACK = 7000
```

Use `isDVMKind(kind)` to test if a kind falls in the DVM range (5000–7000).

**Kind classifiers**

```typescript
isRegularKind(kind)                // 1000–9999 and select low kinds
isPlainReplaceableKind(kind)       // 0, 3, and 10000–19999
isEphemeralKind(kind)              // 20000–29999
isParameterizedReplaceableKind(kind) // 30000–39999
isReplaceableKind(kind)            // plain OR parameterized replaceable
isDVMKind(kind)                    // 5000–7000
```

### Tags

| Export | Description |
|--------|-------------|
| `tagSpec(keys, matchValue?, normalizeValue?)` | Build a `TagSpec` — `keys` is a string or string[]; optional value filter/normalizer |
| `hexTags(keys)` | Spec matching 32-byte hex values (`isHex32`) — e/p tags |
| `addressTags(keys)` | Spec matching replaceable addresses (`Address.isAddress`) — a tags |
| `relayTags(keys)` | Spec matching relay urls (`isRelayUrl`) — r/relay tags |
| `topicTags(keys)` | Spec that strips a leading `#` from values — t tags |
| `kindTags(keys)` | Spec whose values parse to `number` — k tags |
| `matchTags(spec, tags)` | All tags matching the spec — spec first, then the tags array |
| `matchTag(spec, tags)` | First tag matching the spec, or `undefined` |
| `tagValues(spec, tags)` | Values (index 1, normalized) of all matching tags; undefined dropped |
| `tagValue(spec, tags)` | Value of the first matching tag, or `undefined` |
| `tagMatcher(spec)` / `tagValueExtractor(spec)` | The raw `(tag)=>boolean` / `(tag)=>T` for a spec |

The old `getTagValue`/`getPubkeyTagValues`/`getEventTags`/… accessors were removed — use the spec selectors above (e.g. `tagValues(hexTags("p"), tags)`, `tagValue(tagSpec("title"), tags)`). Thread helpers `getReplyTags`/`getCommentTags` moved to `@welshman/domain` (kinds 1 / 1111).

### Filters

| Export | Description |
|--------|-------------|
| `matchFilter(filter, event)` | Test if event matches a single filter |
| `matchFilters(filters, event)` | Test if event matches any filter |
| `getIdFilters(idsOrAddresses)` | Build filters from mixed ids and addresses |
| `getReplyFilters(events, filter?)` | Build filters to find replies |
| `addRepostFilters(filters)` | Add kind 6/16 repost filters |
| `unionFilters(filters)` | Merge overlapping filters |
| `intersectFilters(groups)` | Intersect arrays of filter groups |
| `trimFilter(filter)` / `trimFilters(filters)` | Limit array fields to 1000 items |
| `getFilterId(filter)` | Compact string key for a filter |
| `getFilterGenerality(filter)` | 0 = specific, 1 = general |
| `guessFilterDelta(filters, max?)` | Estimate appropriate time window in seconds |
| `getFilterResultCardinality(filter)` | Expected result count for id-based filters |

### Address

| Export | Description |
|--------|-------------|
| `Address` class | Handles `kind:pubkey:identifier` and NIP-19 naddr format |
| `Address.isAddress(s)` | Validate address string format |
| `Address.from(s, relays?)` | Parse from `kind:pubkey:identifier` string |
| `Address.fromNaddr(naddr)` | Parse from NIP-19 naddr |
| `Address.fromEvent(event, relays?)` | Create from addressable event |
| `address.toString()` | Serialize to `kind:pubkey:identifier` |
| `address.toNaddr()` | Serialize to NIP-19 naddr |
| `getAddress(event)` | Convenience: get address string from event |

### Relay

| Export | Description |
|--------|-------------|
| `RelayMode` | Enum: `Read`, `Write`, `Search`, `Blocked`, `Messaging` |
| `RelayProfile` | NIP-11 relay info type |
| `isRelayUrl(url)` | Validate relay URL |
| `isShareableRelayUrl(url)` | True if valid relay URL and not a local address |
| `isOnionUrl(url)` | Tor address check |
| `isLocalUrl(url)` | Local address check |
| `isIPAddress(url)` | IP address check |
| `normalizeRelayUrl(url)` | Normalize to standard wss:// format |
| `displayRelayUrl(url)` | Strip protocol and trailing slash |
| `displayRelayProfile(profile?, fallback?)` | Get display name for relay |

### Relay Selection (routing DSL)

`RelaySelection.ts` provides a declarative routing DSL: a *relay selection* names a
source ("the author's outbox", "this pubkey's inbox", "the relays this event was seen
on") rather than a list of urls. Domain code (`@welshman/domain`) produces selections
from an event; a `Resolver` (wired up by `@welshman/app`'s `Router`) turns them into
concrete urls in a context where the necessary data (relay lists, tracker, repository)
is available.

**Route + selection types**

| Type | Description |
|------|-------------|
| `EventRef` | `{ id?, pubkey?, kind?, identifier?, relays? }` — all optional/additive reference to an event to route relative to |
| `RelayRoute` | Discriminated union: `userInbox` / `userOutbox` / `userMessaging`, `pubkeyInbox` / `pubkeyOutbox` / `pubkeyMessaging` (`{pubkey}`), `eventInbox` / `eventOutbox` / `seen` (`{ref}`), `relay` (`{url}`), `index`, `search` |
| `RelaySelection` | `{ route: RelayRoute; weight: number }` |

**DSL constructors** (each defaults `weight = 1`)

| Export | Returns | Description |
|--------|---------|-------------|
| `inbox(pubkey, weight?)` | `RelaySelection` | that pubkey's read relays |
| `outbox(pubkey, weight?)` | `RelaySelection` | that pubkey's write relays |
| `messaging(pubkey, weight?)` | `RelaySelection` | that pubkey's NIP-17 messaging relays |
| `userInbox(weight?)` / `userOutbox(weight?)` / `userMessaging(weight?)` | `RelaySelection` | the current user's relays |
| `eventInbox(ref, weight?)` / `eventOutbox(ref, weight?)` | `RelaySelection` | the referenced event's author relays |
| `seen(ref, weight?)` | `RelaySelection` | relays the event was found on (tracker + ref hints) |
| `relay(url, weight?)` | `RelaySelection` | a literal relay url (formerly `relayHint`) |
| `relays(urls, weight?)` | `RelaySelection[]` | one selection per url (formerly `relayHints`) |
| `inboxes(pubkeys, weight?)` | `RelaySelection[]` | `uniq(pubkeys).map(inbox)` — inbox per referenced pubkey |
| `indexers(weight?)` | `RelaySelection` | profile/relay-list index relays |
| `searchRelays(weight?)` | `RelaySelection` | full-text search relays |

Note `relays` and `inboxes` return **arrays** — spread them with `...` into a route list; every other constructor returns a single `RelaySelection`.

**Resolved selections + fallback policies**

| Export | Description |
|--------|-------------|
| `Selection` | `{ weight: number; relays: string[] }` — a concrete, resolved weighted relay set |
| `makeSelection(relays, weight?)` | Build a `Selection`, filtering `isRelayUrl` and normalizing each url |
| `FallbackPolicy` | `(count: number, limit: number) => number` |
| `addNoFallbacks` | Never add fallback relays |
| `addMinimalFallbacks` | Add one fallback only if nothing else was found |
| `addMaximalFallbacks` | Top up to the limit with fallbacks |

**`RelayScenario`** — scores and picks concrete relays from weighted `Selection`s:

```typescript
new RelayScenario(selections: Selection[], options?: RelayScenarioOptions)
// options: { policy?, limit?, allowLocal?, allowOnion?, allowInsecure?,
//            getRelayQuality?, getDefaultRelays? }

scenario.limit(n)          // chainable (returns a cloned scenario)
scenario.policy(fn)        // chainable
scenario.allowLocal(bool) / allowOnion(bool) / allowInsecure(bool)   // chainable
scenario.getUrls()         // string[] — weight-accumulated, quality-scored, limited, topped up per policy
scenario.getUrl()          // first of getUrls()
```

Filters onion/local/insecure (`ws://`) relays unless explicitly allowed, accumulates
weight per relay, scores each by `quality * (1 + log(weight))` with random noise, takes
the best `limit` (default 3), then adds shuffled `getDefaultRelays()` per the fallback
policy (default `addNoFallbacks`).

**`Resolver`** — replaces the old standalone `resolve()`. Bundles a single route
resolver function plus bound scenario options:

```typescript
type ResolveRoute = (route: RelayRoute) => MaybeAsync<string[]>

new Resolver(routeResolver: ResolveRoute, options?: RelayScenarioOptions)

await resolver.scenario(selections)  // Promise<RelayScenario> — resolves each route, builds a scenario
await resolver.relays(selections)    // Promise<string[]>  — scenario(...).getUrls()
await resolver.relay(selections)     // Promise<string | undefined> — scenario(...).getUrl()
```

In an app, `@welshman/app`'s `Router` owns the `Resolver` (`app.use(Router).resolver`),
built with `getRelayQuality`/`getDefaultRelays` from app config, and injects it into
every domain kind's context. Domain readers/writers then call
`def.context.resolver.scenario(...)` / `.relay(...)`.

```typescript
import {outbox, inboxes, relay, relays, Resolver} from '@welshman/util'

// Declarative selections: author's write relays (weight 1) + each mentioned
// pubkey's read relays (weight 0.5) + an explicit relay hint.
const selections = [
  outbox(authorPubkey),
  ...inboxes(mentionedPubkeys, 0.5),
  relay('wss://relay.example.com'),
]

// A Resolver dereferences routes -> urls given some route resolver.
const resolver = new Resolver(resolveRoute, {limit: 5, getRelayQuality})
const urls = await resolver.relays(selections)   // string[]
```

### Zaps (NIP-57)

| Export | Description |
|--------|-------------|
| `getLnUrl(address)` | Convert lightning address or URL to LNURL; returns `undefined` if invalid |
| `getInvoiceAmount(bolt11)` | Extract millisatoshi amount from BOLT11 invoice |
| `hrpToMillisat(hrpString)` | Convert human-readable BTC amount to millisats (`bigint`) |
| `getLnUrl(address)` | Derive an lnurl from a lud06/lud16 address |
| `Zapper` type | `{ lnurl, pubkey?, callback?, minSendable?, maxSendable?, nostrPubkey?, allowsNostr? }` |
| `Zap` type | `{ request: TrustedEvent, response: TrustedEvent, invoiceAmount: number }` |

### Wallet

| Export | Description |
|--------|-------------|
| `WalletType` | Enum: `WebLN`, `NWC` |
| `Wallet` | Union: `WebLNWallet | NWCWallet` |
| `isWebLNWallet(wallet)` | Type guard |
| `isNWCWallet(wallet)` | Type guard |

### NIP-42 (Relay Auth)

```typescript
makeRelayAuth(url: string, challenge: string): StampedEvent
// Creates kind 22242 auth event; sign before sending
```

### NIP-98 (HTTP Auth)

```typescript
makeHttpAuth(url: string, method?: string, body?: string): Promise<StampedEvent>
makeHttpAuthHeader(event: SignedEvent): string  // Returns "Nostr <base64>"
```

### NIP-86 (Relay Management)

```typescript
sendManagementRequest(url: string, request: ManagementRequest, authEvent: SignedEvent): Promise<ManagementResponse>
// ManagementResponse = { result?: any; error?: string }
// ManagementMethod enum covers: BanPubkey, AllowPubkey, BanEvent, AllowEvent, etc.
```

### Links

```typescript
fromNostrURI(s: string): string  // strips "nostr:" or "nostr://" prefix
toNostrURI(s: string): string    // ensures "nostr:" prefix
```

### Blossom (Media Servers)

```typescript
makeBlossomAuthEvent(opts: BlossomAuthEventOpts): StampedEvent
uploadBlob(server, blob, opts?): Promise<Response>
getBlob(server, sha256, opts?): Promise<Response>
deleteBlob(server, sha256, opts?): Promise<Response>
listBlobs(server, pubkey, opts?): Promise<Response>
checkBlobExists(server, sha256, opts?): Promise<{exists, size?}>
buildBlobUrl(server, sha256, extension?): string
encryptFile(file: Blob): Promise<EncryptedFile>
decryptFile(encryptedFile: EncryptedFile): Promise<Uint8Array>
```

---

## Common Patterns

### Creating and inspecting events

```typescript
import { makeEvent, NOTE, PROFILE, RELAYS, LONG_FORM, getIdentifier, getIdOrAddress } from '@welshman/util'

// Text note (kind 1)
const note = makeEvent(NOTE, {
  content: 'Hello Nostr!',
  tags: [['t', 'nostr']],
})

// Profile update (kind 0)
const profile = makeEvent(PROFILE, {
  content: JSON.stringify({ name: 'Alice', about: 'Nostr dev' }),
  tags: [],
})

// Relay list (kind 10002)
const relayList = makeEvent(RELAYS, {
  content: '',
  tags: [
    ['r', 'wss://relay.example.com', 'read'],
    ['r', 'wss://relay2.example.com', 'write'],
  ],
})
```

### Pre-verifying persisted events with verifiedSymbol

When loading events from a local store (IndexedDB, localStorage, etc.) at startup, you
can skip expensive signature re-validation by marking them as already verified:

```typescript
import { verifiedSymbol } from '@welshman/util'
import type { TrustedEvent } from '@welshman/util'

// Load from storage
const storedEvents: TrustedEvent[] = await db.getAll('events')

// Mark as pre-verified — verifyEvent() will return true immediately (without
// re-running the cryptographic check) for events that have a sig field
for (const event of storedEvents) {
  event[verifiedSymbol] = true
}

app.repository.load(storedEvents)
```

Only do this for events you persisted yourself after they were validated. Never set
`verifiedSymbol` on events received directly from untrusted external sources.

### Working with tags

```typescript
import {
  tagSpec,
  hexTags,
  topicTags,
  relayTags,
  tagValue,
  tagValues,
} from '@welshman/util'

// A selector takes a spec FIRST, then the tags array
const title  = tagValue(tagSpec('title'), event.tags)     // string | undefined
const urls   = tagValues(tagSpec('r'), event.tags)        // string[]

// Multiple keys at once
const ids    = tagValues(tagSpec(['e', 'a']), event.tags) // string[]

const mentions = tagValues(hexTags('p'), event.tags)      // string[]
const topics   = tagValues(topicTags('t'), event.tags)    // string[] ("#x" -> "x")
const relays   = tagValues(relayTags(['r', 'relay']), event.tags)

// NIP-10 thread context lives in @welshman/domain now
// const { roots, replies, mentions } = getReplyTags(event.tags)
```

### Matching and building filters

```typescript
import { matchFilters, getIdFilters, getReplyFilters, addRepostFilters, NOTE } from '@welshman/util'
import { ago, HOUR } from '@welshman/lib'

// Does this event match our subscription?
const active = matchFilters([{ kinds: [NOTE], authors: [myPubkey] }], event)

// Fetch a set of events by id or address
const filters = getIdFilters([
  'abc123',                             // event id
  '30023:deadbeef:my-slug',             // address
])

// Find all replies to a set of events
const replyFilters = getReplyFilters(events, { since: ago(HOUR) })

// Automatically include repost kinds
const withReposts = addRepostFilters([{ kinds: [NOTE] }])
```

### Addresses for replaceable events

```typescript
import { Address, getAddress } from '@welshman/util'

// From an addressable event
const addr = Address.fromEvent(event, ['wss://relay.example.com'])
console.log(addr.toString())  // '30023:deadbeef:my-slug'
console.log(addr.toNaddr())   // 'naddr1...'

// Round-trip from naddr
const parsed = Address.fromNaddr('naddr1...')

// Quick string form
const addressStr = getAddress(event)  // '30023:deadbeef:my-slug'
```

### Zap flow

```typescript
import { getLnUrl, makeEvent, ZAP_REQUEST } from '@welshman/util'
import { Zappers } from '@welshman/app'

// Step 1: resolve LNURL
const lnurl = getLnUrl('satoshi@getalby.com')
if (!lnurl) throw new Error('Invalid lightning address')

// Step 2: build zap request (kind 9734)
const zapRequest = makeEvent(ZAP_REQUEST, {
  content: 'Great post!',
  tags: [
    ['p', recipientPubkey],
    ['e', targetEventId],
    ['amount', '5000'],           // millisats
    ['lnurl', lnurl],
    ['relays', 'wss://relay.damus.io'],
  ],
})

// Step 3: sign, send to LNURL callback, pay invoice...

// Step 4: validate receipt (kind 9735)
const zap = await app.use(Zappers).validateZapReceipt(zapReceipt, zappedEvent)
if (zap) {
  console.log(`Received ${zap.invoiceAmount} msat`, zap.request.content)
}
```

### NIP-42 relay authentication

```typescript
import { makeRelayAuth } from '@welshman/util'

// Inside relay AUTH handler
const authEvent = makeRelayAuth('wss://relay.example.com', challengeFromRelay)
const signed = await signer.sign(authEvent)
// send signed AUTH message to relay
```

### NIP-98 HTTP authentication

```typescript
import { makeHttpAuth, makeHttpAuthHeader } from '@welshman/util'

const body = JSON.stringify({ data: 'example' })
const authEvent = await makeHttpAuth('https://api.example.com/upload', 'POST', body)
const signed = await signer.signEvent(authEvent)

await fetch('https://api.example.com/upload', {
  method: 'POST',
  body,
  headers: {
    Authorization: makeHttpAuthHeader(signed),
    'Content-Type': 'application/json',
  },
})
```

---

## Integration Notes

- **`@welshman/net`** — uses `TrustedEvent`, `Filter`, `SignedEvent` from this package as the wire types for relay connections and subscriptions.
- **`@welshman/store`** — provides Svelte stores over repositories built on `TrustedEvent`; relies on `isReplaceable`, `getAddress`, etc. for deduplication.
- **`@welshman/app`** — high-level application layer; wraps net/store/router and uses zap helpers from this package (profile/list/handler/room helpers now live in `@welshman/domain`).
- **`@welshman/router`** — uses `RelayMode` and relay URL helpers when computing relay selections.
- **`@welshman/signer`** — produces `SignedEvent` objects that satisfy types defined here; signers also provide the `nip44` encrypt/decrypt functions used by `@welshman/domain` list writers to encrypt private (NIP-44) tags.

---

## Gotchas & Tips

- **`TrustedEvent` vs `SignedEvent`**: Most in-app code should accept `TrustedEvent` (has id, may have sig). Only require `SignedEvent` when you need to ensure the event has a signature.

- **Replaceable event identity**: Use `getIdOrAddress` rather than `event.id` when referencing events that may be addressable — the address string is stable across updates, the id is not.

- **`getAncestors` handles two protocols**: Kind 1111 (comment/NIP-22) uses uppercase `E`/`A` for roots and lowercase for replies, returning `{ roots, replies }`. All other kinds use NIP-10 positional rules, returning `{ roots, replies, mentions }` where `mentions` is always present but may be an empty array. You do not need to branch on this; `getAncestors`, `getParentIdOrAddr`, and `isChildOf` handle it automatically.

- **`app.use(Zappers).validateZapReceipt` returns `undefined` on any validation failure** including amount mismatch, wrong zapper pubkey, malformed invoice, or self-zap. Always check the result. For a reactive list of a parent's valid zaps use `validZapReceipts(receipts, parent)`, which re-validates as each recipient's zapper loads.

- **`getLnUrl` handles three input forms**: bare lightning address (`user@domain`), full HTTPS URL, or already-encoded `lnurl1...`. Returns `undefined` for anything else.

- **`normalizeRelayUrl` vs `displayRelayUrl`**: Use `normalizeRelayUrl` before storing or comparing relay URLs. Use `displayRelayUrl` only for human-readable display (strips protocol/trailing slash).

- **`Address.isAddress`** checks the `kind:pubkey:identifier` format only, not naddr. To validate an naddr string, use `Address.fromNaddr` inside a try/catch.

- **Tag selector argument order**: the spec comes **first**, the tags array **second** — `tagValue(tagSpec('title'), event.tags)`, `tagValues(hexTags('p'), event.tags)`. Mixing up the order produces no TypeScript error but silently returns `undefined` or `[]`.

- **`verifiedSymbol` is a Symbol key**: you must import `verifiedSymbol` from `@welshman/util` and use it as a computed property key — `event[verifiedSymbol] = true`. You cannot use a string key. The symbol is re-exported from `nostr-tools/pure`, so it is the same identity as the one used internally by `verifyEvent`.

---

## Related

- **`@welshman/domain`** (welshman-domain skill) — Profiles, lists, handlers, rooms, and event routing moved out of `@welshman/util` and now live here. The old free functions (`readProfile`/`makeProfile`, `readList`/`makeList`, `PublishedProfile`/`PublishedList`, `Encryptable`, the handler/room helpers, …) were replaced by configurable `KindFactory` bundles: `Kind.configure(context).reader(event)` returns an async Reader that decodes the event, and `.writer(reader?)` builds/edits one. Private (NIP-44) list tags are handled inside the list Reader/Writer, so `Encryptable`/`DecryptedEvent` no longer exist.
