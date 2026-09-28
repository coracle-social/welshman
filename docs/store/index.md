# @welshman/store

[![version](https://badgen.net/npm/v/@welshman/store)](https://npmjs.com/package/@welshman/store)

Svelte store utilities for nostr clients. The package derives live-updating stores from a `Repository`, and provides persisted, throttled and getter-enhanced stores.

## What's Included

- **Repository stores** - Live maps and arrays of events, or of items decoded from events, that update as the repository changes
- **Relay-scoped stores** - The same collections keyed per relay through a `Tracker`
- **Loaders** - Cached, deduplicated item loaders with exponential backoff
- **Synced stores** - Writable stores persisted to a `StorageProvider`
- **Throttled stores and getters** - Throttled notifications, and synchronous `get()` access that subscribes when called often

## Quick Example

```typescript
import {Repository} from '@welshman/net'
import {NAMED_PEOPLE, hexTags, tagValues} from '@welshman/util'
import type {TrustedEvent} from '@welshman/util'
import {deriveItemsByKey} from '@welshman/store'

const repository = new Repository()

type PeopleList = {event: TrustedEvent; pubkeys: string[]}

// `eventToItem` returns undefined to skip an event
const listsByPubkey = deriveItemsByKey<PeopleList>({
  repository,
  filters: [{kinds: [NAMED_PEOPLE]}],
  eventToItem: (event: TrustedEvent) =>
    event.tags.length > 1 ? {event, pubkeys: tagValues(hexTags("p"), event.tags)} : undefined,
  getKey: list => list.event.pubkey,
})
```

With `@welshman/app`, `app.use(Domain).reader(Kind)` is a ready-made `eventToItem` for any domain kind.

## Installation

```bash
npm install @welshman/store
```
