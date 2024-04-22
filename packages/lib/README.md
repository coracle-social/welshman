# @welshman/lib [![version](https://badgen.net/npm/v/@welshman/lib)](https://npmjs.com/package/@welshman/lib)

Some general-purpose utilities used elsewhere in @welshman.

- `Deferred` is just a promise with `resolve` and `reject` methods.
- `Emitter` extends EventEmitter to support `emitter.on('*', ...)`.
- `Fluent` is a wrapper around arrays with chained methods that modify and copy the underlying array.
- `LRUCache` is an implementation of an LRU cache.
- `Worker` is an implementation of an asynchronous queue.
- `Tools` is a collection of general-purpose utility functions.
- `Store` is an implementation of svelte-like subscribable stores with extra features.
