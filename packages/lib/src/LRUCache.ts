/**
 * Least Recently Used (LRU) cache implementation
 * @template T - Type of cache keys
 * @template U - Type of cache values
 */
export class LRUCache<T, U> {
  map = new Map<T, U>()

  constructor(readonly maxSize: number = Infinity) {}

  has(k: T) {
    return this.map.has(k)
  }

  get(k: T) {
    if (!this.map.has(k)) return

    const v = this.map.get(k) as U

    this.map.delete(k)
    this.map.set(k, v)

    return v
  }

  set(k: T, v: U) {
    this.map.delete(k)
    this.map.set(k, v)

    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next()

      if (!oldest.done) this.map.delete(oldest.value)
    }
  }

  pop(k: T) {
    const v = this.map.get(k)

    this.map.delete(k)

    return v
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

  const pop = (...args: Args) => {
    const k = getKey(args)

    return cache.has(k) ? cache.pop(k)! : getValue(args)
  }

  get.cache = cache
  get.getKey = getKey
  get.getValue = getValue
  get.pop = pop

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
