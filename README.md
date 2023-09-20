# Paravel [![version](https://badgen.net/npm/v/paravel)](https://npmjs.com/package/paravel)

Another nostr toolkit, focused on creating highly a configurable client system. What paravel provides is less a library of code than a library of abstractions. Odds are you will end up creating a custom implementation of every component to suit your needs, but if you start with paravel that will be much easier than if you pile on parameters over time.

# Utilities

- [Deferred](./src/utils/Deferred.ts') is just a promise with `resolve` and `reject` methods.
- [Socket](./src/utils/Socket.ts') is a wrapper around isomorphic-ws that handles json parsing/serialization.
- [Queue](./src/utils/Queue.ts') is an implementation of an asynchronous queue.

# Components

- [Connection](./src/Connection.ts') is a wrapper for `Socket` with send and receive queues, and a `ConnectionMeta` instance.
- [ConnectionMeta](./src/ConnectionMeta.ts') tracks stats for a given `Connection`.
- [Executor](./src/Executor.ts') implements common nostr flows on `target`
- [Pool](./src/Pool.ts') is a thin wrapper around `Map` for use with `Relay`s.

# Executor targets

Executor targets have an event `bus`, a `send` method, a `cleanup` method, and are passed to an `Executor` for use.

- [Relay](./src/Relay.ts') takes a `Connection` and provides listeners for different verbs.
- [Relays](./src/Relays.ts') takes an array of `Connection`s and provides listeners for different verbs, merging all events into a single stream.
- [Plex](./src/Plex.ts') takes an array of urls and a `Connection` and sends and receives wrapped nostr messages over that connection.

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
      ? new Plex(urls, this.pool.get(this.multiplexerUrl))
      : new Relays(urls.map(url => this.pool.get(url)))
  }
  subscribe(urls, filters, id, {onEvent, onEose}) {
    const executor = new Executor(this.getTarget(urls))

    return executor.subscribe(filters, id, {onEvent, onEose})
  }
}
```
