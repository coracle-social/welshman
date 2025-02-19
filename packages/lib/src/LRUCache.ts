/**
 * Least Recently Used (LRU) cache implementation
 * @template T - Type of cache keys
 * @template U - Type of cache values
 */
export class LRUCache<T, U> {
  map = new Map<T, U>()
  keys: T[] = []

  constructor(readonly maxSize: number = Infinity) {}

  has(k: T) {
    return this.map.has(k)
  }

  get(k: T) {
    const v = this.map.get(k)

    if (v !== undefined) {
      this.keys.push(k as T)

      if (this.keys.length > this.maxSize * 2) {
        this.keys = this.keys.splice(-this.maxSize)
      }
    }

    return v
  }

  set(k: T, v: U) {
    this.map.set(k, v)
    this.keys.push(k)

    if (this.map.size > this.maxSize) {
      this.map.delete(this.keys.shift() as T)
    }
  }
}

/**
 * Creates a memoized function with LRU caching
 * @template T - Cache key type
 * @template V - Cache value type
 * @template Args - Function argument types
 */
export function cached<T, V, Args extends any[]>({
  maxSize,
  getKey,
  getValue,
}: {
  maxSize: number
  getKey: (args: Args) => T
  getValue: (args: Args) => V
}) {
  const cache = new LRUCache<T, V>(maxSize)

  const get = (...args: Args) => {
    const k = getKey(args)

    if (!cache.has(k)) {
      cache.set(k, getValue(args))
    }

    return cache.get(k)!
  }

  get.cache = cache
  get.getKey = getKey
  get.getValue = getValue

  return get
}

/**
 * Creates a simple memoized function with default settings
 * @template V - Cache value type
 * @template Args - Function argument types
 */
export function simpleCache<V, Args extends any[]>(getValue: (args: Args) => V) {
  return cached({maxSize: 10 ** 5, getKey: xs => xs.join(":"), getValue})
}
