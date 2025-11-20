# Getter

Utility for creating optimized getter functions that adapt based on access patterns.

```typescript
// Create optimized getter that switches to subscription when hot
getter<T>(store: Readable<T>, options?: {
  threshold?: number // Calls per second before switching to subscription (default: 10)
}): () => T

// Add .get() method to a store
withGetter<T>(store: Readable<T>): ReadableWithGetter<T>
withGetter<T>(store: Writable<T>): WritableWithGetter<T>
```

The `getter` function automatically switches between `get()` and subscription based on call frequency, optimizing performance for hot code paths.
