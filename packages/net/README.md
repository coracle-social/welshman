# @welshman/net [![version](https://badgen.net/npm/v/@welshman/net)](https://npmjs.com/package/@welshman/net)

Utilities having to do with connection management and nostr messages.

- `Connection` - a wrapper for `Socket` with send and receive queues, and a `ConnectionMeta` instance.
- `ConnectionMeta` - tracks stats for a given `Connection`.
- `Context` - an object containing a default `Pool` and global configuration options.
- `Executor` - implements common nostr flows on a given `target`
- `Pool` - a thin wrapper around `Map` which stores `Connection`s.
- `Publish` - utilities for publishing events.
- `Socket` - a wrapper around isomorphic-ws that handles json parsing/serialization.
- `Subscribe` - utilities for making requests against nostr relays.
- `Tracker` - tracks which relays a given event was seen on.

Executor `target`s extend `Emitter`, and have a `send` method, a `cleanup` method, and a `connections` getter. They are intended to be passed to an `Executor` for use.

- `targets/Multi` allows you to compose multiple targets together.
- `targets/Plex` takes an array of urls and a `Connection` and sends and receives wrapped nostr messages over that connection.
- `targets/Relay` takes a `Connection` and provides listeners for different verbs.
- `targets/Relays` takes an array of `Connection`s and provides listeners for different verbs, merging all events into a single stream.
