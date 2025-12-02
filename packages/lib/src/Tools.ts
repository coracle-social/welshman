import {bech32, utf8} from "@scure/base"

export type Obj<T = any> = Record<string, T>

export type Maybe<T> = T | undefined

export type MaybeAsync<T> = T | Promise<T>

export const isDefined = <T>(x: T, ...args: unknown[]) => x !== undefined

export const isUndefined = <T>(x: T, ...args: unknown[]) => x === undefined

export const assertDefined = <T>(x: T, ...args: unknown[]) => x!

// ----------------------------------------------------------------------------
// Working with types
// ----------------------------------------------------------------------------

export type Override<T, R> = Omit<T, keyof R> & R

export type MakeOptional<T, K extends keyof T> = Override<T, Partial<Pick<T, K>>>

export type MakeNonOptional<T> = {
  [K in keyof T]-?: T[K]
}

// ----------------------------------------------------------------------------
// Basic functional programming utilities
// ----------------------------------------------------------------------------

/** Function that does nothing and returns undefined */
export const noop = (...args: unknown[]) => undefined

/**
 * Returns the input value unchanged
 * @param x - Any value
 * @returns The same value
 */
export const identity = <T>(x: T, ...args: unknown[]) => x

/**
 * Creates a function that always returns the same value
 * @param x - Value to return
 * @returns Function that returns x
 */
export const always =
  <T>(x: T, ...args: unknown[]) =>
  () =>
    x

/**
 * Returns the logical NOT of a value
 * @param x - Value to negate
 * @returns !x
 */
export const not = (x: any, ...args: unknown[]) => !x

/**
 * Deep equality comparison
 * @param a - First value
 * @param b - Second value
 * @returns True if values are deeply equal
 */
export const equals = (a: any, b: any) => {
  if (a === b) return true

  if (a instanceof Set) {
    if (!(b instanceof Set) || a.size !== b.size) {
      return false
    }

    return Array.from(a).every(x => b.has(x))
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false
    }

    for (let i = 0; i < a.length; i++) {
      if (!equals(a[i], b[i])) {
        return false
      }
    }

    return true
  }

  if (isPojo(a)) {
    if (!isPojo(b)) {
      return false
    }

    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)

    if (aKeys.length !== bKeys.length) {
      return false
    }

    for (const k of aKeys) {
      if (!equals(a[k], b[k])) {
        return false
      }
    }

    return true
  }

  return false
}

// ----------------------------------------------------------------------------
// Numbers
// ----------------------------------------------------------------------------

/** Converts string or number to number */
export const ensureNumber = (x: number | string) => parseFloat(x as string)

/** Converts a `number | undefined` to a number, defaulting to 0 */
export const num = (x: number | undefined) => x || 0

/** Adds two numbers, handling undefined values */
export const add = (x: number | undefined, y: number | undefined) => num(x) + num(y)

/** Subtracts two numbers, handling undefined values */
export const sub = (x: number | undefined, y: number | undefined) => num(x) - num(y)

/** Multiplies two numbers, handling undefined values */
export const mul = (x: number | undefined, y: number | undefined) => num(x) * num(y)

/** Divides two numbers, handling undefined values */
export const div = (x: number | undefined, y: number) => num(x) / y

/** Increments a number by 1, handling undefined values */
export const inc = (x: number | undefined) => add(x, 1)

/** Decrements a number by 1, handling undefined values */
export const dec = (x: number | undefined) => sub(x, 1)

/** Less than comparison, handling undefined values */
export const lt = (x: number | undefined, y: number | undefined) => num(x) < num(y)

/** Less than or equal comparison, handling undefined values */
export const lte = (x: number | undefined, y: number | undefined) => num(x) <= num(y)

/** Greater than comparison, handling undefined values */
export const gt = (x: number | undefined, y: number | undefined) => num(x) > num(y)

/** Greater than or equal comparison, handling undefined values */
export const gte = (x: number | undefined, y: number | undefined) => num(x) >= num(y)

/** Returns maximum value in array, handling undefined values */
export const max = (xs: (number | undefined)[]) =>
  xs.reduce((a: number, b) => Math.max(num(a), num(b)), 0)

/** Returns minimum value in array, handling undefined values */
export const min = (xs: (number | undefined)[]) => {
  const [head, ...tail] = xs.filter(x => x !== undefined) as number[]

  if (tail.length === 0) return head || 0

  return tail.reduce((a: number, b) => Math.min(a, b), head)
}

/** Returns sum of array values, handling undefined values */
export const sum = (xs: (number | undefined)[]) => xs.reduce((a: number, b) => add(a, b), 0)

/** Returns average of array values, handling undefined values */
export const avg = (xs: (number | undefined)[]) => sum(xs) / xs.length

/**
 * Checks if a number is between two values (exclusive)
 * @param bounds - Lower and upper bounds
 * @param n - Number to check
 * @returns True if n is between low and high
 */
export const between = ([low, high]: [number, number], n: number) => n > low && n < high

/**
 * Checks if a number is between two values (inclusive)
 * @param bounds - Lower and upper bounds
 * @param n - Number to check
 * @returns True if n is between low and high
 */
export const within = ([low, high]: [number, number], n: number) => n >= low && n <= high

/**
 * Constrains number between min and max values
 * @param bounds - Minimum and maximum allowed values
 * @param n - Number to clamp
 * @returns Clamped value
 */
export const clamp = ([min, max]: [number, number], n: number) => Math.min(max, Math.max(min, n))

/**
 * Round a number to the nearest float precision
 * @param precision - Number of decimal places
 * @param x - Number to round
 * @returns Formatted number
 */
export const round = (precision: number, x: number) =>
  Math.round(x * Math.pow(10, precision)) / Math.pow(10, precision)

// ----------------------------------------------------------------------------
// Timestamps
// ----------------------------------------------------------------------------

/** One minute in seconds */

export const MINUTE = 60

/** One hour in seconds */
export const HOUR = 60 * MINUTE

/** One day in seconds */
export const DAY = 24 * HOUR

/** One week in seconds */
export const WEEK = 7 * DAY

/** One month in seconds (approximate) */
export const MONTH = 30 * DAY

/** One quarter in seconds (approximate) */
export const QUARTER = 90 * DAY

/** One year in seconds (approximate) */
export const YEAR = 365 * DAY

/** User's default locale */
export const LOCALE = new Intl.DateTimeFormat().resolvedOptions().locale

/** User's default timezone */
export const TIMEZONE = (() => {
  const [_, sign = "+", offset] = new Date().toString().match(/GMT([-\+]?)(\d+)/)!

  return sign + offset.slice(0, 2) + ":" + offset.slice(2)
})()

/**
 * Multiplies time unit by count
 * @param unit - Time unit in seconds
 * @param count - Number of units
 * @returns Total seconds
 */
export const int = (unit: number, count = 1) => unit * count

/** Returns current Unix timestamp in seconds */
export const now = () => Math.round(Date.now() / 1000)

/**
 * Returns Unix timestamp from specified time ago
 * @param unit - Time unit in seconds
 * @param count - Number of units
 * @returns Timestamp in seconds
 */
export const ago = (unit: number, count = 1) => now() - int(unit, count)

/**
 * Converts seconds to milliseconds
 * @param seconds - Time in seconds
 * @returns Time in milliseconds
 */
export const ms = (seconds: number) => seconds * 1000

/**
 * Converts seconds to date
 * @param seconds - Time in seconds
 * @returns Date object
 */
export const secondsToDate = (seconds: number) => new Date(seconds * 1000)

/**
 * Converts date object to seconds
 * @param date - Date object
 * @returns timestamp in seconds
 */
export const dateToSeconds = (date: Date) => Math.round(date.valueOf() / 1000)

/**
 * Creates a local date from a date string
 * @param dateString - date string
 * @param timezone - timezone string
 * @returns timezone-aware Date object
 */
export const createLocalDate = (dateString: any, timezone = TIMEZONE) =>
  new Date(`${dateString} GMT${timezone}`)

/** Formatter for date+time */
export const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "short",
  timeStyle: "short",
})

/**
 * Formats seconds as a datetime
 * @param seconds - timestamp in seconds
 * @returns datetime string
 */
export const formatTimestamp = (seconds: number) => dateTimeFormatter.format(secondsToDate(seconds))

/** Formatter for date */
export const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "long",
  day: "numeric",
})

/**
 * Formats seconds as a date
 * @param seconds - timestamp in seconds
 * @returns date string
 */
export const formatTimestampAsDate = (ts: number) => dateFormatter.format(secondsToDate(ts))

/** Formatter for time */
export const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeStyle: "short",
})

/**
 * Formats seconds as a time
 * @param seconds - timestamp in seconds
 * @returns time string
 */
export const formatTimestampAsTime = (ts: number) => timeFormatter.format(secondsToDate(ts))

/**
 * Formats seconds as a relative date (x minutes ago)
 * @param seconds - timestamp in seconds
 * @returns relative date string
 */
export const formatTimestampRelative = (ts: number) => {
  let unit
  let delta = now() - ts
  if (delta < int(MINUTE)) {
    unit = "second"
  } else if (delta < int(HOUR)) {
    unit = "minute"
    delta = Math.round(delta / int(MINUTE))
  } else if (delta < int(DAY, 2)) {
    unit = "hour"
    delta = Math.round(delta / int(HOUR))
  } else {
    unit = "day"
    delta = Math.round(delta / int(DAY))
  }

  const locale = new Intl.RelativeTimeFormat().resolvedOptions().locale
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  })

  return formatter.format(-delta, unit as Intl.RelativeTimeFormatUnit)
}

// ----------------------------------------------------------------------------
// Sequences
// ----------------------------------------------------------------------------

/**
 * Returns the first element of an array
 * @param xs - The array
 * @returns First element or undefined
 */
export const first = <T>(xs: Iterable<T>, ...args: unknown[]) => {
  for (const x of xs) {
    return x
  }
}

/**
 * Returns the first element of the first array in a nested array
 * @param xs - Array of arrays
 * @returns First element of first array or undefined
 */
export const ffirst = <T>(xs: Iterable<Iterable<T>>, ...args: unknown[]) => {
  for (const chunk of xs) {
    for (const x of chunk) {
      return x
    }
  }
}

/**
 * Returns the last element of an array
 * @param xs - The array
 * @returns Last element or undefined
 */
export const last = <T>(xs: Iterable<T>, ...args: unknown[]) => {
  const a = Array.from(xs)

  return a[a.length - 1]
}

/**
 * Returns array with first n elements removed
 * @param n - Number of elements to drop
 * @param xs - Input array
 * @returns Array with first n elements removed
 */
export const drop = <T>(n: number, xs: Iterable<T>) => Array.from(xs).slice(n)

/**
 * Returns first n elements of array
 * @param n - Number of elements to take
 * @param xs - Input array
 * @returns Array of first n elements
 */
export const take = <T>(n: number, xs: Iterable<T>) => Array.from(xs).slice(0, n)

/**
 * Concatenates multiple arrays, filtering out null/undefined
 * @param xs - Arrays to concatenate
 * @returns Combined array
 */
export const concat = <T>(...xs: T[][]) => xs.flatMap(x => (x === undefined ? [] : x))

/**
 * Appends element to array
 * @param x - Element to append
 * @param xs - Array to append to
 * @returns New array with element appended
 */
export const append = <T>(x: T, xs: Iterable<T>) => concat(Array.from(xs), [x])

/**
 * Prepends element to array
 * @param x - Element to prepend
 * @param xs - Array to prepend to
 * @returns New array with element prepended
 */
export const prepend = <T>(x: T, xs: Iterable<T>) => concat([x], Array.from(xs))

/**
 * Creates union of two arrays
 * @param a - First array
 * @param b - Second array
 * @returns Array containing unique elements from both arrays
 */
export const union = <T>(a: Iterable<T>, b: Iterable<T>) => uniq([...a, ...b])

/**
 * Returns elements common to both arrays
 * @param a - First array
 * @param b - Second array
 * @returns Array of elements present in both inputs
 */
export const intersection = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const s = new Set(b)

  return Array.from(a).filter(x => s.has(x))
}

/**
 * Returns elements in first array not present in second
 * @param a - Source array
 * @param b - Array of elements to exclude
 * @returns Array containing elements unique to first array
 */
export const difference = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const s = new Set(b)

  return Array.from(a).filter(x => !s.has(x))
}

/**
 * Removes all instances of an element from array
 * @param a - Element to remove
 * @param xs - Source array
 * @returns New array with element removed
 */
export const remove = <T>(a: T, xs: T[]) => xs.filter(x => x !== a)

/**
 * Removes element at index
 * @param i - Index to remove
 * @param xs - Source array
 * @returns New array with element removed
 */
export const removeAt = <T>(i: number, xs: T[]) => [...xs.slice(0, i), ...xs.slice(i + 1)]

/**
 * Returns elements from second array not present in first
 * @param a - Array of elements to exclude
 * @param b - Source array
 * @returns Filtered array
 */
export const without = <T>(a: T[], b: T[]) => b.filter(x => !a.includes(x))

/**
 * Toggles presence of element in array
 * @param x - Element to toggle
 * @param xs - Source array
 * @returns New array with element added or removed
 */
export const toggle = <T>(x: T, xs: T[]) => (xs.includes(x) ? remove(x, xs) : append(x, xs))

/**
 * Generates sequence of numbers from a to b
 * @param a - Start number (inclusive)
 * @param b - End number (exclusive)
 * @param step - Increment between numbers
 * @yields Numbers in sequence
 */
export function* range(a: number, b: number, step = 1) {
  for (let i = a; i < b; i += step) {
    yield i
  }
}

/**
 * Yields indexed items
 * @param items - A collection of items
 * @yields tuples of [index, item]
 */
export function* enumerate<T>(items: T[]) {
  for (let i = 0; i < items.length; i += 1) {
    yield [i, items[i]] as [number, T]
  }
}

/** Returns a function that gets property value from object */
export const pluck = <T>(k: string, xs: Record<string, unknown>[]) => xs.map(x => x[k] as T)

/**
 * Creates object from array of key-value pairs
 * @param pairs - Array of [key, value] tuples
 * @returns Object with keys and values from pairs
 */
export const fromPairs = <T>(pairs: [k?: string, v?: T, ...args: unknown[]][]) => {
  const r: Record<string, T> = {}

  for (const [k, v] of pairs) {
    if (k && v) {
      r[k] = v
    }
  }

  return r
}

/**
 * Flattens array of arrays into single array
 * @param xs - Array of arrays to flatten
 * @returns Flattened array
 */
export const flatten = <T>(xs: (T | T[])[], ...args: unknown[]) => xs.flatMap(identity)

/**
 * Splits array into two arrays based on predicate
 * @param f - Function to test elements
 * @param xs - Array to partition
 * @returns Tuple of [matching, non-matching] arrays
 */
export const partition = <T>(f: (x: T) => boolean, xs: Iterable<T>) => {
  const a: T[] = []
  const b: T[] = []

  for (const x of xs) {
    if (f(x)) {
      a.push(x)
    } else {
      b.push(x)
    }
  }

  return [a, b]
}

/** Maps any iterable */
export const map = <T, R>(f: (x: T) => R, xs: Iterable<T>) => Array.from(xs).map(f)

/**
 * Keeps items based on predicate
 * @param f - Whether to keep an item
 * @param xs - Items to filter
 * @returns Filtered array
 */
export const filter = <T>(f: (x: T) => any, xs: Iterable<T>) => Array.from(xs).filter(f)

/**
 * Removes items based on predicate
 * @param f - Whether to remove an item from the array
 * @param xs - Items to filter
 * @returns Filtered array
 */
export const reject = <T>(f: (x: T) => any, xs: Iterable<T>) => Array.from(xs).filter(complement(f))

/**
 * Finds a single item based on predicate
 * @param f - Whether an item matches
 * @param xs - Items to filter
 * @returns first matching item
 */
export const find = <T>(f: (x: T) => any, xs: Iterable<T>) => {
  for (const x of xs) {
    if (f(x)) return x
  }
}

/**
 * Finds a single item based on predicate
 * @param f - Whether an item matches
 * @param xs - Items to filter
 * @returns whether an item matches
 */
export const some = <T>(f: (x: T) => any, xs: Iterable<T>) => {
  for (const x of xs) {
    if (f(x)) return true
  }

  return false
}

/**
 * Returns array with duplicate elements removed
 * @param xs - Array with possible duplicates
 * @returns Array with unique elements
 */
export const uniq = <T>(xs: T[]) => Array.from(new Set(xs))

/**
 * Returns array with elements unique by key function
 * @param f - Function to generate key for each element
 * @param xs - Input array
 * @returns Array with elements unique by key
 */
export const uniqBy = <T>(f: (x: T) => any, xs: Iterable<T>) => {
  const s = new Set<any>()
  const r = []

  for (const x of xs) {
    const k = f(x)

    if (s.has(k)) {
      continue
    }

    s.add(k)
    r.push(x)
  }

  return r
}

/**
 * Returns sorted copy of array
 * @param xs - Array to sort
 * @returns New sorted array
 */
export const sort = <T>(xs: T[]) => [...xs].sort()

/**
 * Returns array sorted by key function
 * @param f - Function to generate sort key
 * @param xs - Array to sort
 * @returns Sorted array
 */
export const sortBy = <T>(f: (x: T) => any, xs: Iterable<T>) =>
  [...xs].sort((a: T, b: T) => {
    const x = f(a)
    const y = f(b)

    return x < y ? -1 : x > y ? 1 : 0
  })

/**
 * Groups array elements by key function
 * @param f - Function to generate group key
 * @param xs - Array to group
 * @returns Map of groups
 */
export const groupBy = <T, K>(f: (x: T) => K, xs: Iterable<T>) => {
  const r = new Map<K, T[]>()

  for (const x of xs) {
    const k = f(x)
    let v = r.get(k)

    if (!v) {
      v = []
      r.set(k, v)
    }

    v.push(x)
  }

  return r
}

/**
 * Counts array elements by key function
 * @param f - Function to generate group key
 * @param xs - Array to count entries
 * @returns Map of counts
 */
export const countBy = <T, K>(f: (x: T) => K, xs: T[]) => {
  const r = new Map<K, number>()
  for (const [k, items] of groupBy(f, xs)) {
    r.set(k, items.length)
  }

  return r
}

/**
 * Creates map from array using key function
 * @param f - Function to generate key
 * @param xs - Array to index
 * @returns Map of values by key
 */
export const indexBy = <T, K>(f: (x: T) => K, xs: T[]) => {
  const r = new Map<K, T>()

  for (const x of xs) {
    r.set(f(x), x)
  }

  return r
}

/**
 * Creates array of specified length using generator function
 * @param n - Length of array
 * @param f - Function to generate each element
 * @returns Generated array
 */
export const initArray = <T>(n: number, f: () => T) => {
  const result = []

  for (let i = 0; i < n; i++) {
    result.push(f())
  }

  return result
}

/**
 * Splits array into chunks of specified length
 * @param chunkLength - Maximum length of each chunk
 * @param xs - Array to split
 * @returns Array of chunks
 */
export const chunk = <T>(chunkLength: number, xs: T[]) => {
  const result: T[][] = []
  const current: T[] = []

  for (const item of xs) {
    if (current.length < chunkLength) {
      current.push(item)
    } else {
      result.push(current.splice(0))
      current.push(item)
    }
  }

  if (current.length > 0) {
    result.push(current)
  }

  return result
}

/**
 * Splits array into specified number of chunks
 * @param n - Number of chunks
 * @param xs - Array to split
 * @returns Array of n chunks
 */
export const chunks = <T>(n: number, xs: T[]) => {
  const result: T[][] = initArray(n, () => [])

  for (let i = 0; i < xs.length; i++) {
    result[i % n].push(xs[i])
  }

  return result
}

/** Splits array into two parts at index */
export const splitAt = <T>(n: number, xs: T[]) => [xs.slice(0, n), xs.slice(n)]

/** Inserts element into array at index */
export const insertAt = <T>(n: number, x: T, xs: T[]) => [...xs.slice(0, n), x, ...xs.slice(n)]

/** Replaces array element at index */
export const replaceAt = <T>(n: number, x: T, xs: T[]) => [...xs.slice(0, n), x, ...xs.slice(n + 1)]

/** Returns random element from array */
export const choice = <T>(xs: T[]): T => xs[Math.floor(xs.length * Math.random())]

/** Returns shuffled copy of iterable */
export const shuffle = <T>(xs: Iterable<T>): T[] =>
  Array.from(xs).sort(() => (Math.random() > 0.5 ? 1 : -1))

/** Returns n random elements from array */
export const sample = <T>(n: number, xs: T[]) => shuffle(xs).slice(0, n)

/** Checks if value is iterable */
export const isIterable = (x: any) => Symbol.iterator in Object(x)

/** Ensures value is iterable by wrapping in array if needed */
export const toIterable = (x: any) => (isIterable(x) ? x : [x])

/** Ensures value is array by wrapping if needed */
export const ensurePlural = <T>(x: T | T[]) => (x instanceof Array ? x : [x])

/** Ensures values are not undefined */
export const removeUndefined = <T>(xs: T[]) => xs.filter(isDefined).map(assertDefined)

/** Returns a list of overlapping pairs of elements in xs */
export const overlappingPairs = <T>(xs: T[]): T[][] => {
  const result: T[][] = []
  for (let i = 0; i < xs.length - 1; i++) {
    result.push([xs[i], xs[i + 1]])
  }

  return result
}

// ----------------------------------------------------------------------------
// Objects
// ----------------------------------------------------------------------------

/**
 * Checks if value is a plain object
 * @param obj - Value to check
 * @returns True if value is a plain object
 */
export const isPojo = (obj: any) => {
  if (obj === null || typeof obj !== "object") {
    return false
  }

  return Object.getPrototypeOf(obj) === Object.prototype
}

/**
 * Creates new object with only specified keys
 * @param ks - Keys to keep
 * @param x - Source object
 * @returns New object with only specified keys
 */
export const pick = <T extends Obj>(ks: string[], x: T) => {
  const r: T = {...x}

  for (const k of Object.keys(x)) {
    if (!ks.includes(k)) {
      delete r[k]
    }
  }

  return r
}

/**
 * Creates new object with specified keys removed
 * @param ks - Keys to remove
 * @param x - Source object
 * @returns New object without specified keys
 */
export const omit = <T extends Obj>(ks: string[], x: T) => {
  const r: T = {...x}

  for (const k of ks) {
    delete r[k]
  }

  return r
}

/**
 * Creates new object excluding entries with specified values
 * @param xs - Values to exclude
 * @param x - Source object
 * @returns New object without entries containing specified values
 */
export const omitVals = <T extends Obj>(xs: any[], x: T) => {
  const r: Obj = {}

  for (const [k, v] of Object.entries(x)) {
    if (!xs.includes(v)) {
      r[k] = v
    }
  }

  return r as T
}

/**
 * Filters object values based on predicate
 * @param f - Function to test values
 * @param x - Object to filter
 * @returns Object with only values that pass predicate
 */
export const filterVals = <T extends Record<string, any>>(f: (v: any) => boolean, x: T) => {
  const r = {} as T

  for (const k in x) {
    if (f(x[k])) {
      r[k] = x[k]
    }
  }

  return r
}

/**
 * Creates new object with transformed keys
 * @param f - Function to transform keys
 * @param x - Source object
 * @returns Object with transformed keys
 */
export const mapKeys = <T extends Obj>(f: (v: string) => string, x: T) => {
  const r: Obj = {}

  for (const [k, v] of Object.entries(x)) {
    r[f(k)] = v
  }

  return r as T
}

/**
 * Creates new object with transformed values
 * @param f - Function to transform values
 * @param x - Source object
 * @returns Object with transformed values
 */
export const mapVals = <V, U>(f: (v: V) => U, x: Record<string, V>) => {
  const r: Record<string, U> = {}

  for (const [k, v] of Object.entries(x)) {
    r[k] = f(v)
  }

  return r
}

/**
 * Merges two objects, with left object taking precedence
 * @param a - Left object
 * @param b - Right object
 * @returns Merged object with a"s properties overriding b"s
 */
export const mergeLeft = <T extends Obj>(a: T, b: T) => ({
  ...b,
  ...a,
})

/**
 * Merges two objects, with right object taking precedence
 * @param a - Left object
 * @param b - Right object
 * @returns Merged object with b"s properties overriding a"s
 */
export const mergeRight = <T extends Obj>(a: T, b: T) => ({
  ...a,
  ...b,
})

/** Deep merge two objects, prioritizing the first argument. */
export const deepMergeLeft = (a: Obj, b: Obj) => deepMergeRight(b, a)

/** Deep merge two objects, prioritizing the second argument. */
export const deepMergeRight = (a: Obj, b: Obj) => {
  a = {...a}

  for (const [k, v] of Object.entries(b)) {
    if (isPojo(v) && isPojo(a[k])) {
      a[k] = deepMergeRight(a[k], v)
    } else {
      a[k] = v
    }
  }

  return a
}

/**
 * Switches on key in object, with default fallback
 * @param k - Key to look up
 * @param m - Object with values and optional default
 * @returns Value at key or default value
 */
export const switcher = <T>(k: string, m: Record<string, T>) =>
  m[k] === undefined ? m.default : m[k]

// ----------------------------------------------------------------------------
// Maps
// ----------------------------------------------------------------------------

export const mapPop = <K, T>(k: K, m: Map<K, T>) => {
  const v = m.get(k)

  m.delete(k)

  return v
}

// ----------------------------------------------------------------------------
// Combinators
// ----------------------------------------------------------------------------

/** Returns a function that returns the boolean negation of the given function */
export const complement =
  <T extends unknown[]>(f: (...args: T) => any) =>
  (...args: T) =>
    !f(...args)

/**
 * Safely executes function and handles errors
 * @param f - Function to execute
 * @param onError - Optional error handler
 * @returns Function result or undefined if error
 */
export const tryCatch = <T>(f: () => T, onError?: (e: Error) => void): T | undefined => {
  try {
    const r = f()

    if (r instanceof Promise) {
      r.catch(e => onError?.(e as Error))
    }

    return r
  } catch (e) {
    onError?.(e as Error)
  }

  return undefined
}

/**
 * Throws an error with the given message
 */
export const thrower = (message: string) => () => {
  throw new Error(message)
}

/**
 * Creates function that only executes once
 * @param f - Function to wrap
 * @returns Function that executes f only on first call
 */
export const once = (f: (...args: any) => void) => {
  let called = false

  return (...args: any) => {
    if (!called) {
      called = true
      f(...args)
    }
  }
}

/**
 * Calls a function
 * @param f - Function to call
 * @returns Whatever f returns
 */
export const call = <T>(f: () => T, ...args: unknown[]) => f()

/**
 * Memoizes function results based on arguments
 * @param f - Function to memoize
 * @returns Memoized function
 */
export const memoize = <T, Args extends any[]>(f: (...args: Args) => T) => {
  let prevArgs: Args
  let result: T

  return (...args: Args): T => {
    if (!equals(prevArgs, args)) {
      prevArgs = args
      result = f(...args)
    }

    return result
  }
}

/**
 * Executes a function if the value is defined
 * @param x - The value to check
 * @param f - Function to execute if x is defined
 * @returns Result of f(x) if x is defined, undefined otherwise
 */
export const ifLet = <T>(x: T | undefined, f: (x: T) => void) =>
  x === undefined ? undefined : f(x)

// ----------------------------------------------------------------------------
// Randomness
// ----------------------------------------------------------------------------

/**
 * Generates random integer between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export const randomInt = (min = 0, max = 9) => min + Math.round(Math.random() * (max - min))

/**
 * Generates random string ID
 * @returns Random string suitable for use as an ID
 */
export const randomId = (): string => Math.random().toString().slice(2)

// ----------------------------------------------------------------------------
// Async
// ----------------------------------------------------------------------------

/**
 * Creates a promise that resolves after specified time
 * @param t - Time in milliseconds
 * @returns Promise that resolves after t milliseconds
 */
export const sleep = (t: number) => new Promise(resolve => setTimeout(resolve, t))

export type PollOptions = {
  signal: AbortSignal
  condition: () => boolean
  interval?: number
}

/**
 * Creates a promise that resolves after the condition completes or timeout
 * @param options - PollOptions
 * @returns void Promise
 */
export const poll = ({interval = 300, condition, signal}: PollOptions) =>
  new Promise<void>(resolve => {
    const int = setInterval(() => {
      if (condition()) {
        resolve()
        clearInterval(int)
      }
    }, interval)

    if (condition()) {
      resolve()
      clearInterval(int)
    }

    signal.addEventListener("abort", () => {
      resolve()
      clearInterval(int)
    })
  })

/**
 * Creates a microtask that yields to other tasks in the event loop
 * @returns Promise that resolves after yielding
 */
export const yieldThread = () => {
  if (
    typeof window !== "undefined" &&
    "scheduler" in window &&
    "yield" in (window as any).scheduler
  ) {
    return (window as any).scheduler.yield()
  }

  return new Promise<void>(resolve => {
    setTimeout(resolve, 0)
  })
}

/**
 * Creates throttled version of function
 * @param ms - Minimum time between calls
 * @param f - Function to throttle
 * @returns Throttled function
 */
export const throttle = <F extends (...args: any[]) => any>(ms: number, f: F) => {
  if (ms === 0) {
    return f
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Parameters<F> | undefined

  const later = () => {
    if (lastArgs !== undefined) {
      const args = lastArgs
      lastArgs = undefined
      f(...args)
      timeoutId = setTimeout(later, ms)
    } else {
      timeoutId = undefined
    }
  }

  return (...args: Parameters<F>) => {
    lastArgs = args

    if (timeoutId === undefined) {
      f(...args)
      lastArgs = undefined
      timeoutId = setTimeout(later, ms)
    }
  }
}

/**
 * Creates throttled function that returns cached value
 * @param ms - Minimum time between updates
 * @param f - Function to throttle
 * @returns Function returning latest value
 */
export const throttleWithValue = <T>(ms: number, f: () => T) => {
  let value: T

  const update = throttle(ms, () => {
    value = f()
  })

  return () => {
    update()

    return value
  }
}

/**
 * Creates batching function that collects items
 * this function does not delay execution, if a series of items is passed in sequence
 * the first item will be processed immediately, and the rest will be batched
 * @param t - Time window for batching
 * @param f - Function to process batch
 * @returns Function that adds items to batch
 */
export const batch = <T>(t: number, f: (xs: T[]) => void) => {
  const xs: T[] = []
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const later = () => {
    if (xs.length > 0) {
      f(xs.splice(0))
      timeoutId = setTimeout(later, t)
    } else {
      timeoutId = undefined
    }
  }

  return (x: T) => {
    const shouldFlush = timeoutId === undefined

    xs.push(x)

    if (shouldFlush) {
      f(xs.splice(0))
      timeoutId = setTimeout(later, t)
    }
  }
}

/**
 * Creates batching function that returns results
 * @param t - Time window for batching
 * @param execute - Function to process batch
 * @returns Function that returns promise of result
 */
export const batcher = <T, U>(t: number, execute: (request: T[]) => U[] | Promise<U[]>) => {
  const queue: {request: T; resolve: (x: U) => void; reject: (reason?: string) => void}[] = []
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const _execute = async () => {
    timeoutId = undefined
    const items = queue.splice(0)
    const results = await execute(items.map(item => item.request))

    if (results.length === items.length) {
      results.forEach((r, i) => items[i].resolve(r))
    } else {
      items.forEach(item => item.reject("Execute must return a result for each request"))
    }
  }

  return (request: T): Promise<U> =>
    new Promise((resolve, reject) => {
      queue.push({request, resolve, reject})

      if (timeoutId === undefined) {
        timeoutId = setTimeout(_execute, t)
      }
    })
}

/**
 * Returns a promise that resolves after some proportion of promises complete
 * @param threshold - number between 0 and 1 for how many promises to wait for
 * @param promises - array of promises
 * @returns promise
 */
export const race = (threshold: number, promises: Promise<unknown>[]) => {
  let count = 0

  if (threshold === 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    promises.forEach(p => {
      p.then(() => {
        count++

        if (count >= threshold * promises.length) {
          resolve()
        }
      }).catch(reject)
    })
  })
}

// ----------------------------------------------------------------------------
// URLs
// ----------------------------------------------------------------------------

/**
 * Removes protocol (http://, https://, etc) from URL
 * @param url - URL to process
 * @returns URL without protocol
 */
export const stripProtocol = (url: string) => url.replace(/.*:\/\//, "")

/**
 * Formats URL for display by removing protocol, www, and trailing slash
 * @param url - URL to format
 * @returns Formatted URL
 */
export const displayUrl = (url: string) =>
  stripProtocol(url)
    .replace(/^(www\.)?/i, "")
    .replace(/\/$/, "")

/**
 * Extracts and formats domain from URL
 * @param url - URL to process
 * @returns Formatted domain name
 */
export const displayDomain = (url: string) => displayUrl(first(url.split(/[\/\?]/)) || "")

// ----------------------------------------------------------------------------
// JSON, localStorage, fetch, event emitters, etc
// ----------------------------------------------------------------------------

/**
 * Safely parses JSON string
 * @param json - JSON string to parse
 * @returns Parsed object or null if invalid
 */
export const parseJson = (json: string | undefined) => {
  if (!json) return undefined

  try {
    return JSON.parse(json)
  } catch (e) {
    return undefined
  }
}

/**
 * Gets and parses JSON from localStorage
 * @param k - Storage key
 * @returns Parsed value or undefined if invalid/missing
 */
export const getJson = (k: string) => parseJson(localStorage.getItem(k) || "")

/**
 * Stringifies and stores value in localStorage
 * @param k - Storage key
 * @param v - Value to store
 */
export const setJson = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v))

/** Options for fetch requests */
type FetchOpts = {
  method?: string
  headers?: Record<string, string | boolean>
  body?: string | FormData
}

/**
 * Fetches JSON from URL with options
 * @param url - URL to fetch from
 * @param opts - Fetch options
 * @returns Promise of parsed JSON response
 */
export const fetchJson = async (url: string, opts: FetchOpts = {}) => {
  // Make sure the url is valid, this will throw if not
  url = String(new URL(url))

  if (!opts.headers) {
    opts.headers = {}
  }

  if (!opts.headers["Accept"]) {
    opts.headers["Accept"] = "application/json"
  }

  const res = await fetch(url, opts as RequestInit)
  const json = await res.json()

  return json
}

/**
 * Posts JSON data to URL
 * @param url - URL to post to
 * @param data - Data to send
 * @param opts - Additional fetch options
 * @returns Promise of parsed JSON response
 */
export const postJson = async <T>(url: string, data: T, opts: FetchOpts = {}) => {
  if (!opts.method) {
    opts.method = "POST"
  }

  if (!opts.headers) {
    opts.headers = {}
  }

  if (!opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json"
  }

  opts.body = JSON.stringify(data)

  return fetchJson(url, opts)
}

/**
 * Uploads file to URL
 * @param url - Upload URL
 * @param file - File to upload
 * @returns Promise of parsed JSON response
 */
export const uploadFile = (url: string, file: File) => {
  const body = new FormData()

  body.append("file", file)

  return fetchJson(url, {method: "POST", body})
}

/**
 * A generic type-safe event listener function that works with event emitters.
 *
 * @param target - The event target object with add/remove listener methods
 * @param eventName - The name of the event to listen for
 * @param callback - The callback function to execute when the event occurs
 * @returns A function that removes the event listener when called
 */
export const on = <EventMap extends Record<string | symbol, any[]>, E extends keyof EventMap>(
  target: {
    on(event: E, listener: (...args: EventMap[E]) => any): any
    off(event: E, listener: (...args: EventMap[E]) => any): any
  },
  eventName: E,
  callback: (...args: EventMap[E]) => void,
): (() => void) => {
  target.on(eventName, callback)

  return () => {
    target.off(eventName, callback)
  }
}

// ----------------------------------------------------------------------------
// Strings
// ----------------------------------------------------------------------------

/**
 * Truncates string to length, breaking at word boundaries
 * @param s - String to truncate
 * @param l - Maximum length
 * @param suffix - String to append if truncated
 * @returns Truncated string
 */
export const ellipsize = (s: string, l: number, suffix = "...") => {
  if (s.length < l * 1.1) {
    return s
  }

  while (s.length > l && s.includes(" ")) {
    s = s.split(" ").slice(0, -1).join(" ")
  }

  return s + suffix
}

/** Displays a list of items with oxford commas and a chosen conjunction */
export const displayList = <T>(xs: T[], conj = "and", n = 6) => {
  if (xs.length > n + 2) {
    return `${xs.slice(0, n).join(", ")}, ${conj} ${xs.length - n} others`
  }

  if (xs.length < 3) {
    return xs.join(` ${conj} `)
  }

  return `${xs.slice(0, -1).join(", ")}, ${conj} ${xs.slice(-1).join("")}`
}

/** Generates a hash from input string */
export const hash = (s: string) =>
  Math.abs(s.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0))

// ----------------------------------------------------------------------------
// Curried utilities for working with collections
// ----------------------------------------------------------------------------

/** Returns a function that gets the nth element of an array */
export const nth =
  (i: number) =>
  <T>(xs: T[], ...args: unknown[]) =>
    xs[i]

/** Returns a function that checks if nth element equals value */
export const nthEq =
  (i: number, v: any) =>
  (xs: any[], ...args: unknown[]) =>
    xs[i] === v

/** Returns a function that checks if nth element does not equal value */
export const nthNe =
  (i: number, v: any) =>
  (xs: any[], ...args: unknown[]) =>
    xs[i] !== v

/** Returns a function that checks if key/value pairs of x match all pairs in spec */
export const spec =
  (values: Obj | Array<any>) =>
  (x: Obj | Array<any>, ...args: unknown[]) => {
    if (Array.isArray(values)) {
      for (let i = 0; i < values.length; i++) {
        if ((x as Array<any>)[i] !== values[i]) {
          return false
        }
      }
    } else {
      for (const [k, v] of Object.entries(values)) {
        if ((x as Obj)[k] !== v) return false
      }
    }

    return true
  }

/** Returns a function that checks equality with value */
export const eq =
  <T>(v: T) =>
  (x: T, ...args: unknown[]) =>
    x === v

/** Returns a function that checks inequality with value */
export const ne =
  <T>(v: T) =>
  (x: T, ...args: unknown[]) =>
    x !== v

/** Returns a function that gets property value from object */
export const prop =
  <T>(k: string) =>
  (x: Record<string, unknown>) =>
    x[k] as T

/** Returns a function that adds/updates a property on object */
export const assoc =
  <K extends string, T>(k: K, v: T) =>
  <U>(o: U): U =>
    ({...o, [k]: v}) as U

/** Returns a function that removes a property on object */
export const dissoc =
  <K extends string, T extends Obj>(k: K) =>
  (o: T) =>
    omit([k], o)

/** Returns a function that checks whether a value is in the given sequence */
export const member =
  <T>(xs: Iterable<T>) =>
  (x: T) =>
    Array.from(xs).includes(x)

// ----------------------------------------------------------------------------
// Sets
// ----------------------------------------------------------------------------

/**
 * Adds value to Set at key in object
 * @param m - Object mapping keys to Sets
 * @param k - Key to add to
 * @param v - Value to add
 */
export const addToKey = <T>(m: Record<string, Set<T>>, k: string, v: T) => {
  const s = m[k]

  if (s) {
    s.add(v)
  } else {
    m[k] = new Set([v])
  }
}

/**
 * Pushes value to array at key in object
 * @param m - Object mapping keys to arrays
 * @param k - Key to push to
 * @param v - Value to push
 */
export const pushToKey = <T>(m: Record<string, T[]>, k: string, v: T) => {
  const a = m[k]

  if (a) {
    a.push(v)
  } else {
    m[k] = [v]
  }
}

// ----------------------------------------------------------------------------
// Maps
// ----------------------------------------------------------------------------

/**
 * Adds value to Set at key in Map
 * @param m - Map of Sets
 * @param k - Key to add to
 * @param v - Value to add
 */
export const addToMapKey = <K, T>(m: Map<K, Set<T>>, k: K, v: T) => {
  const s = m.get(k)

  if (s) {
    s.add(v)
  } else {
    m.set(k, new Set([v]))
  }
}

/**
 * Pushes value to array at key in Map
 * @param m - Map of arrays
 * @param k - Key to push to
 * @param v - Value to push
 */
export const pushToMapKey = <K, T>(m: Map<K, T[]>, k: K, v: T) => {
  const a = m.get(k)

  if (a) {
    a.push(v)
  } else {
    m.set(k, [v])
  }
}

// ----------------------------------------------------------------------------
// Bech32 <-> hex encoding
// ----------------------------------------------------------------------------

/**
 * Converts hex string to bech32 format
 * @param prefix - Bech32 prefix
 * @param hex - Hex string to convert
 * @returns Bech32 encoded string
 */
export const hexToBech32 = (prefix: string, hex: string) =>
  bech32.encode(prefix, bech32.toWords(utf8.decode(hex)), false)

/**
 * Converts bech32 string to hex format
 * @param b32 - Bech32 string to convert
 * @returns Hex encoded string
 */
export const bech32ToHex = (b32: string) =>
  utf8.encode(bech32.fromWords(bech32.decode(b32 as any, false).words))

// ----------------------------------------------------------------------------
// Bytes <-> hex encoding
// ----------------------------------------------------------------------------

/**
 * Converts an array buffer or Uint8Array to hex format
 * @param buffer - ArrayBuffer or Uint8Array to convert
 * @returns Hex encoded string
 */
export const bytesToHex = (buffer: ArrayBuffer | Uint8Array) => {
  if (buffer instanceof ArrayBuffer) {
    buffer = new Uint8Array(buffer)
  }

  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Converts a hex string to an array buffer
 * @param hex - hex string
 * @returns ArrayBuffer
 */
export const hexToBytes = (hex: string) =>
  new Uint8Array(hex.match(/.{2}/g)!.map(hex => parseInt(hex, 16)))

// ----------------------------------------------------------------------------
// Binary data
// ----------------------------------------------------------------------------

export const textEncoder = new TextEncoder()

export const textDecoder = new TextDecoder()

/**
 * Computes SHA-256 hash of binary data
 * @param data - Binary data to hash
 * @returns Promise resolving to hex-encoded hash string
 */
export const sha256 = async (data: ArrayBuffer | Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}
