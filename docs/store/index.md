# @welshman/store

[![version](https://badgen.net/npm/v/@welshman/store)](https://npmjs.com/package/@welshman/store)

A utility package providing welshman-specific svelte store functionality and utilities for managing state. While it's primarily built for use with Svelte's store system, the concepts could be valuable for developers familiar with reactive programming patterns like RxJS.

## What's Included

- **Basic Utilities** - Enhanced stores with persistence, throttling, and getter methods
- **Event-Based Stores** - Specialized stores for working with nostr events and repositories
- **Custom Adapters** - Two-way data transformation with maintained reactivity
- **Persistence Layer** - Automatic localStorage synchronization
- **Performance Optimizations** - Throttled updates and efficient subscription management

## Quick Example

```typescript
import {Repository, NAMED_PEOPLE, TrustedEvent, PublishedList, readList} from '@welshman/util'
import {deriveItemsByKey} from '@welshman/store'

const repository = new Repository()

// Create a reactive map of lists indexed by pubkey
const listsByPubkey = deriveItemsByKey<PublishedList>({
  repository,
  filters: [{kinds: [NAMED_PEOPLE]}],
  eventToItem: (event: TrustedEvent) => (event.tags.length > 1 ? readList(event) : null),
  getKey: (list: PublishedList) => list.event.pubkey,
})
```

## Installation

```bash
npm install @welshman/store
```
