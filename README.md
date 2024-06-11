# Welshman

A nostr toolkit focused on creating highly a configurable client system, extracted from the [Coracle](https://github.com/coracle-social/coracle) nostr client.

This is a monorepo which is split into several different packages:

- [@welshman/lib](./packages/lib) - generic utility functions.
- [@welshman/util](./packages/util) - various nostr-specific utilities.
- [@welshman/net](./packages/net) - framework for interacting with relays.
- [@welshman/content](./packages/content) - utilities for parsing and rendering notes.
- [@welshman/feeds](./packages/feeds) - an interpreter for custom nostr feeds.
