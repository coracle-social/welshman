---
name: welshman
description: "Use this skill for general welshman questions: architecture overview, which package to use, getting started, nostr concepts, or when you're unsure which sub-skill applies. Welshman is a modular TypeScript nostr toolkit for building client applications."
---

## What is welshman

Welshman is a modular TypeScript nostr toolkit extracted from the [Coracle](https://coracle.social) nostr client, designed for building highly configurable nostr client applications. It is production-tested, powering both Coracle and [Flotilla](https://flotilla.social). Packages are independent and opt-in — you can grab a single utility or use the full batteries-included framework.

## Package map

| Package | Description |
|---|---|
| `@welshman/util` | Core nostr types, event helpers, filters, and NIP implementations |
| `@welshman/lib` | General-purpose utilities: LRU cache, event emitter, deferred promises, task queue |
| `@welshman/net` | Relay connections, request/publish lifecycle, and auth handling |
| `@welshman/router` | Relay selection strategies for reads and writes |
| `@welshman/store` | Svelte stores and a Repository for indexing/querying nostr events client-side |
| `@welshman/signer` | Signing and login methods: NIP-01 (privkey), NIP-07 (extension), NIP-46 (bunker), NIP-55 (app), NIP-59 (gift wrap) |
| `@welshman/feeds` | Dynamic feed construction, filtering, and composition |
| `@welshman/app` | High-level Svelte stores that compose net, router, store, signer, and feeds into a full application framework |
| `@welshman/content` | Parser and renderer for nostr note content (links, mentions, media, custom formatting) |
| `@welshman/editor` | Batteries-included Svelte rich-text editor component with mention and embed support |

## Dependency layering

Packages are layered so lower-level ones have no welshman dependencies:

- **Foundational** (no welshman deps): `@welshman/lib`, `@welshman/util`
- **Mid-level** (depend only on foundational): `@welshman/net`, `@welshman/router`, `@welshman/store`, `@welshman/signer`
- **Composing** (depend on mid-level + foundational): `@welshman/feeds`, `@welshman/app`
- **UI-focused** (largely independent, UI rendering concerns): `@welshman/content`, `@welshman/editor`

For deep-dives on any package, load the `welshman-<name>` skill (e.g. `welshman-net`, `welshman-app`, `welshman-signer`).

## Getting started

Install only what you need:

```bash
# Full application framework (includes app, net, router, store, signer, feeds)
npm i @welshman/app

# Or assemble manually for more control
npm i @welshman/util @welshman/net @welshman/signer
```

If you're building a conventional nostr web client, use `@welshman/app` for batteries-included functionality. For more advanced usage, use the lower-level modules without `app` for more control.

## Key nostr concepts

- **event** — the fundamental data unit in nostr; a JSON object signed by a keypair
- **kind** — integer field on an event that determines its type (e.g. kind 1 = short text note, kind 0 = profile metadata)
- **filter** — a query object (`{kinds, authors, since, until, limit, ...}`) sent to relays to request matching events
- **relay** — a WebSocket server that stores and forwards nostr events; clients connect to multiple relays
- **NIP** — "Nostr Implementation Possibility"; numbered specifications defining protocol behavior and event kinds
- **pubkey** — 32-byte hex public key that identifies a nostr user
- **signer** — abstraction over key management; handles signing events and optionally encryption, regardless of where the private key lives (in-memory, browser extension, remote bunker, mobile app)

## Common use-case routing

| Goal | Package(s) to use |
|---|---|
| Fetch notes from relays | `@welshman/net` (low-level) or `@welshman/app` (high-level) |
| Select which relays to use | `@welshman/router` |
| Sign and publish events | `@welshman/signer` + `@welshman/net` |
| Build a feed UI | `@welshman/feeds` + `@welshman/app` |
| Parse note text and media | `@welshman/content` |
| Embed a composer / editor | `@welshman/editor` |
| Cache nostr events client-side | `@welshman/store` |
| Core event/filter utilities | `@welshman/util` |
| Low-level helpers (LRU, emitter, utility functions) | `@welshman/lib` |

### App Example

```typescript
import "@welshman/app" // side effects: wires pool → repository + tracker + router

import { openDB } from "idb"
import { batch, on } from "@welshman/lib"
import { verifiedSymbol } from "@welshman/util"
import { repository, tracker, loginWithNip07, publishThunk, userProfile, loadUserProfile } from "@welshman/app"
import { routerContext } from "@welshman/router"
import { load } from "@welshman/net"
import type { TrustedEvent } from "@welshman/util"
import type { RepositoryUpdate } from "@welshman/net"

// 1. Configure fallback relays
routerContext.getDefaultRelays = () => ["wss://relay.example.com", "wss://relay2.example.com"]
routerContext.getIndexerRelays = () => ["wss://indexer.example.com"]

// 2. Open IndexedDB and hydrate the repository
const db = await openDB("my-app", 1, {
  upgrade(db) {
    db.createObjectStore("events", { keyPath: "id" })
  },
})

const stored: TrustedEvent[] = await db.getAll("events")
for (const e of stored) e[verifiedSymbol] = true
repository.load(stored)

// Flush new events to IndexedDB
on(repository, "update", batch(3000, async (updates: RepositoryUpdate[]) => {
  const tx = db.transaction("events", "readwrite")
  for (const { added, removed } of updates) {
    for (const e of added) tx.store.put(e)
    for (const id of removed) tx.store.delete(id)
  }
  await tx.done
}))

// 3. Log in
const pk = await window.nostr.getPublicKey()
loginWithNip07(pk)

// 4. Load user's profile reactively (triggers network fetch if not cached)
await loadUserProfile()

userProfile.subscribe($profile => {
  if ($profile) console.log("Hello,", $profile.name)
})

// 5. Publish a note
import { makeEvent } from "@welshman/util"
import { Router } from "@welshman/router"

const thunk = publishThunk({
  event: makeEvent(1, { content: "Hello, Nostr!", tags: [] }),
  relays: Router.get().FromUser().getUrls(),
})

await thunk.complete
```

### Lower-level Example

```typescript
import { AbstractAdapter, ClientMessage, NetContext, isClientEvent, netContext, publish, request } from '@welshman/net'
import { call, sleep } from '@welshman/lib'
import { Nip01Signer } from '@welshman/signer'
import { makeEvent, NOTE } from '@welshman/util'

const pingSigner = Nip01Signer.fromSecret(/* nostr hex secret key */)
const pongSigner = Nip01Signer.fromSecret(/* nostr hex secret key */)
const RELAY_URL = "bogus.relay"

// Create an adapter for our relay url which just prints the content
export class PrintAdapter extends AbstractAdapter {
  get sockets() { return [] }
  get urls() { return [] }
  send = (message: ClientMessage) => {
    if (isClientEvent(message)) {
      const [_, event] = message
      console.log(event.content)
    }
  }
}

// Configure net context to use our custom adapter
netContext.getAdapter = (url: string, context: NetContext) => {
  if (url === RELAY_URL) {
    return new PrintAdapter()
  }
}

// Loop, sending off pings every so often
call(async () => {
  while (true) {
    await sleep(1000)

    const ping = await pingSigner.sign(
      makeEvent(NOTE, {content: 'ping'})
    )

    await publish({event: ping, relays: [RELAY_URL]})
  }
})

// Meanwhile, listen for pings and quote-note with a pong
call(async () => {
  request({
    relays: [RELAY_URL],
    filters: [{kinds: [NOTE], authors: [await pingSigner.getPubkey()]}],
    onEvent: async (ping, url) => {
      const pong = await pongSigner.sign(
        makeEvent(NOTE, {content: 'pong', tags: [["q", ping.id, RELAY_URL, ping.pubkey]]})
      )

      await publish({event: pong, relays: [RELAY_URL]})
    },
  })
})
```
