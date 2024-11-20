# @welshman/net [![version](https://badgen.net/npm/v/@welshman/net)](https://npmjs.com/package/@welshman/net)

Utilities having to do with connection management and nostr messages.

- `Connection` - the main api for dealing with relay connections
- `ConnectionAuth` - tracks auth status for a connection
- `ConnectionSender` - a send queue for connections
- `ConnectionState` - tracks pending publishes and requests for a connection
- `ConnectionStats` - tracks timing and error stats for a connection
- `Context` - provides default values for configuring `ctx.net`
- `Executor` - implements common nostr flows on a given `target`
- `Pool` - a thin wrapper around `Map` which stores `Connection`s
- `Publish` - utilities for publishing events
- `Socket` - a wrapper around isomorphic-ws that handles json parsing/serialization
- `Subscribe` - utilities for making requests against nostr relays
- `Tracker` - tracks which relays a given event was seen on

Executor `target`s extend `Emitter`, and have a `send` method, a `cleanup` method, and a `connections` getter. They are intended to be passed to an `Executor` for use.

- `targets/Multi` allows you to compose multiple targets together.
- `targets/Relay` takes a `Connection` and provides listeners for different verbs.
- `targets/Relays` takes an array of `Connection`s and provides listeners for different verbs, merging all events into a single stream.
