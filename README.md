# Paravel

Another nostr toolkit, focused on creating highly a configurable client system.

# Utilities

- [Deferred](./lib/Deferred.ts') is just a promise with `resolve` and `reject` methods.
- [EventBus](./lib/EventBus.ts') is an implementation of an event bus.
- [Socket](./lib/Socket.ts') is a wrapper around isomorphic-ws that handles connection status and json parsing/serialization.

# Components

- [Pool](./lib/Pool.ts') is a thin wrapper around `Map` for use with `Relay`s.
- [Executor](./lib/Executor.ts') implements common nostr flows on `target`

# Executables

Executables have an event `bus` and a `send` method and are passed to an `Executor` for use.

- [Relay](./lib/Relay.ts') takes a `Socket` and provides listeners for different verbs.
- [Relays](./lib/Relays.ts') takes an array of `Socket`s and provides listeners for different verbs, merging all events into a single stream.
- [Plex](./lib/Plex.ts') takes an array of urls and a `Socket` and sends and receives wrapped nostr messages over that connection.

# Example

Functionality is split into small chunks to allow for changing out implementations as needed. This is useful when attempting to support novel use cases. Here's a simple implementation of an agent that can use a multiplexer if enabled, or can fall back to communicating directly with all relays.

```javascript
class Agent {
  constructor(multiplexerUrl) {
    this.multiplexerUrl = multiplexerUrl
    this.pool = new Pool()
  }
  getTarget(urls) {
    return this.multiplexerUrl
      ? new Plex(urls, this.pool.add(this.multiplexerUrl))
      : new Relays(urls.map(url => this.pool.add(url)))
    }
  }
  subscribe(urls, filters, id, {onEvent, onEose}) {
    const executor = new Executor(this.getTarget(urls))

    return executor.subscribe(filters, id, {onEvent, onEose})
  }
}
```
