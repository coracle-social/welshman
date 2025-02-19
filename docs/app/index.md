# @welshman/app

A comprehensive framework for building nostr clients, powering production applications like [Coracle](https://coracle.social) and [Flotilla](https://flotilla.social). It provides a complete toolkit for managing events, subscriptions, user data, and relay connections.

## Who is it for?

- Developers building full-featured nostr clients
- Applications needing robust event handling
- Projects using Svelte (though core features work without it)
- Anyone wanting production-tested nostr infrastructure

## Core Systems

### [Context](./context.md)
- Global configuration
- App settings
- Network settings

### [Storage](./storage.md)
- Event caching
- IndexedDB persistence
- Change tracking
- Data synchronization

### [Router](./router.md)
- Smart relay selection
- Connection quality tracking
- Subscription optimization
- Fallback strategies

### [Session](./session.md)
- User authentication (NIP-01, NIP-07, NIP-46, NIP-55)
- Session persistence
- Encryption

### [Collection](./collection.md)
- `Svelte` store management
- Indexing/Caching
- Loading

### [Commands](./commands.md)
- High-level actions (follow, mute, pin)
- Automatic relay selection
- Request status tracking

### [Subscription](./subscription.md)
- Event subscription
- Optimistic updates
- Cache integration

### [Publish (Thunks)](./thunks.md)
- Publish status tracking
- Soft undo support
- Request status tracking
- Automatic relay selection

### [Feed](./feed.md)
- Dynamic feed composition
- Thread loading
- Content discovery
- DVM integration

### [Tag utilities](./tags.md)
- Event references and user mentions
- Thread construction
- Reply chains
- Relay hints

### [Topics](./topics.md)
- Hashtag tracking
- Content organization

### [Web of Trust](./wot.md)
- Trust scoring
- Graph analysis
- Content filtering
