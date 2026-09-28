# Getter

Getter functions that read a store synchronously and adapt to how often they are called.

```typescript
getter<T>(store: Readable<T>, options?: {
  threshold?: number // Calls per second before switching to a subscription (default: 10)
  read?: () => T // Reads the value without subscribing (default: get(store))
}): () => T

withGetter<S extends Readable<any>>(store: S): S & {get: () => StoreValue<S>}
```

`getter` reads the store with `get()` while calls are infrequent. Once calls exceed `threshold` per second it holds a subscription and returns the cached value, and it unsubscribes again when the rate drops.

`withGetter` adds a `get()` method built with `getter`. The rest of the store survives in the type, so `withGetter(synced(...)).ready` and `withGetter(writable(0)).set` both type-check.
