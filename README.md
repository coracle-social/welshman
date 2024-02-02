# Paravel [![version](https://badgen.net/npm/v/paravel)](https://npmjs.com/package/paravel)

A nostr toolkit focused on creating highly a configurable client system. What paravel provides is less a library of code than a library of abstractions. Odds are you will end up creating a custom implementation of every component to suit your needs, but if you start with paravel that will be much easier than if you pile on parameters over time.

## /util

Some general-purpose utilities used in paravel.

- `Deferred` is just a promise with `resolve` and `reject` methods.
- `Queue` is an implementation of an asynchronous queue.
- `LRUCache` is an implementation of an LRU cache.
- `Emitter` extends EventEmitter to support `emitter.on('*', ...)`.

## /nostr

Some nostr-specific utilities.

- `Router` is a utility for selecting relay urls based on user preferences and protocol hints.

## /connect

Utilities having to do with connection management and nostr messages.

- `Socket` is a wrapper around isomorphic-ws that handles json parsing/serialization.
- `Connection` is a wrapper for `Socket` with send and receive queues, and a `ConnectionMeta` instance.
- `ConnectionMeta` tracks stats for a given `Connection`.
- `Executor` implements common nostr flows on `target`
- `Pool` is a thin wrapper around `Map` for use with `Relay`s.
- `Subscription` is a higher-level utility for making requests against multiple nostr relays.

## /connect/target

Executor targets extend `Emitter`, and have a `send` method, a `cleanup` method, and a `connections` getter. They are intended to be passed to an `Executor` for use.

- `Relay` takes a `Connection` and provides listeners for different verbs.
- `Relays` takes an array of `Connection`s and provides listeners for different verbs, merging all events into a single stream.
- `Plex` takes an array of urls and a `Connection` and sends and receives wrapped nostr messages over that connection.
- `Multi` allows you to compose multiple targets together.

# Example

Functionality is split into small chunks to allow for changing out implementations as needed. This is useful when attempting to support novel use cases. Here's a simple implementation of an agent that can use a multiplexer if enabled, or can fall back to communicating directly with all relays.

```javascript
class Agent {
  pool = new Pool()

  constructor(readonly multiplexerUrl: string) {}

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
