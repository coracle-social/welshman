# LRU Cache

A LRU (Least Recently Used) Cache implementation provides efficient caching with automatic eviction of least recently used items when the cache reaches its maximum size.

## Basic Usage

```typescript
// Create cache with max size
const cache = new LRUCache<string, number>(3)

// Add items
cache.set('a', 1)
cache.set('b', 2)
cache.set('c', 3)

// Access items
cache.get('a') // => 1

// Check if key exists
cache.has('b') // => true

// Adding beyond max size evicts least recently used
cache.set('d', 4) // Evicts oldest item
```

## API Reference

### Constructor

```typescript
constructor(maxSize: number = Infinity)
```

Creates a new LRU cache with specified maximum size.

### Methods

#### set(key: T, value: U)
```typescript
set(key: T, value: U): void
```
Adds or updates an item in the cache. If cache is at maximum size, evicts least recently used item.

#### get(key: T)
```typescript
get(key: T): U | undefined
```
Retrieves item from cache. Also marks item as recently used.

#### has(key: T)
```typescript
has(key: T): boolean
```
Checks if key exists in cache without affecting usage tracking.

## Cache Decorator

The package also provides a convenient decorator function for creating memoized functions with LRU caching:

```typescript
function cached<T, V, Args extends any[]>({
  maxSize,
  getKey,
  getValue,
}: {
  maxSize: number
  getKey: (args: Args) => T
  getValue: (args: Args) => V
}): (...args: Args) => V
```

### Usage Example

```typescript
// Create cached function
const getUser = cached({
  maxSize: 1000,
  getKey: (args) => args[0], // Use first argument as cache key
  getValue: async (args) => {
    const [id] = args
    return await fetchUser(id)
  }
})

// Use cached function
const user1 = await getUser(123)
const user2 = await getUser(123) // Returns cached result
```

### Simple Cache Helper

For basic caching needs, there's also a simplified cache creator:

```typescript
function simpleCache<V, Args extends any[]>(
  getValue: (args: Args) => V
) {
  return cached({
    maxSize: 100000,
    getKey: xs => xs.join(':'),
    getValue
  })
}

// Usage
const cachedFn = simpleCache(async (id: string) => {
  return await expensiveOperation(id)
})
```
