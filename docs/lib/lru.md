# LRU Cache

`LRUCache` evicts the least recently used entry once it holds more than its maximum size. Both `get` and `set` count as a use.

## API

```typescript
// LRU cache implementation
export declare class LRUCache<T, U> {
  constructor(maxSize?: number);
  has(k: T): boolean;
  get(k: T): U | undefined;
  set(k: T, v: U): void;
  pop(k: T): U | undefined;
}

// Creates a memoized function with LRU caching
export declare function cached<T, V, Args extends any[]>(options: {
  maxSize: number;
  getKey: (args: Args) => T;
  getValue: (args: Args) => V;
}): ((...args: Args) => V) & { cache: LRUCache<T, V>; pop: (...args: Args) => V };

// Creates a simple memoized function with default settings
export declare function simpleCache<V, Args extends any[]>(getValue: (args: Args) => V): (...args: Args) => V;
```

## Example

```typescript
import { LRUCache } from '@welshman/lib';

// Create cache with max size of 3
const cache = new LRUCache<string, number>(3);

// Add items
cache.set('a', 1);
cache.set('b', 2);
cache.set('c', 3);

console.log(cache.get('a')); // 1

// Reading 'a' made 'b' the least recently used, so adding 'd' evicts 'b'
cache.set('d', 4);

console.log(cache.has('a')); // true
console.log(cache.has('b')); // false
```
