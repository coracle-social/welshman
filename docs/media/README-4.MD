# @welshman/lib [![version](https://badgen.net/npm/v/@welshman/lib)](https://npmjs.com/package/@welshman/lib)

Some general-purpose utilities for use in @welshman apps.

Includes:

- LRU cache implementation
- Worker for throttling work to avoid locking up the UI
- URL normalization (taken from normalize-url)
- A global `ctx` variable which can be used for global configuration
- CustomPromise, which provides an error type, and `defer` utility
- Ramda-like utilities, but without auto-currying
- Utils for throttling, working with nil, json, fetch, deep equals, etc.
