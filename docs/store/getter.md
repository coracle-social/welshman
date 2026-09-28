# Getter

Utility for creating optimized getter functions that adapt based on access patterns.

```typescript
// Create optimized getter that switches to subscription when hot
getter<T>(store: Readable<T>, options?: {
  threshold?: number // Calls per second before switching to subscription (default: 10)
}): () => T

// Add .get() method to a store, keeping the store's own type
withGetter<S extends Readable<any>>(store: S): S & {get: () => StoreValue<S>}
```

Whatever else the store carries survives in the type, so `withGetter(synced(...)).ready` and `withGetter(writable(0)).set` both type-check.

The `getter` function automatically switches between `get()` and subscription based on call frequency, optimizing performance for hot code paths.
