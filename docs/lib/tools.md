# Utility Functions

The `Tools.ts` module provides a comprehensive collection of utility functions for common programming tasks. It includes functions for array manipulation, object handling, type checking, math operations, and more.

## Types

```typescript
type Nil = null | undefined
type Maybe<T> = T | undefined
type Obj<T = any> = Record<string, T>
```

## Categories

### Type Checking & Basic Operations

```typescript
// Check if value is null or undefined
isNil(x: any): boolean

// Execute function if value exists
ifLet<T>(x: T | undefined, f: (x: T) => void)

// Return value unchanged
identity<T>(x: T): T

// Create function that always returns same value
always<T>(x: T): () => T

// Logical NOT
not(x: any): boolean

// Create complement of a predicate function
complement<T extends unknown[]>(f: (...args: T) => any): (...args: T) => boolean
```

### Array Operations

```typescript
// Get first element
first<T>(xs: T[]): T | undefined

// Get first element of first array
ffirst<T>(xs: T[][]): T | undefined

// Get last element
last<T>(xs: T[]): T | undefined

// Drop first n elements
drop<T>(n: number, xs: T[]): T[]

// Take first n elements
take<T>(n: number, xs: T[]): T[]

// Remove duplicates
uniq<T>(xs: T[]): T[]

// Remove duplicates by key function
uniqBy<T>(f: (x: T) => any, xs: T[]): T[]

// Create array of n items using generator function
initArray<T>(n: number, f: () => T): T[]

// Split array into chunks
chunk<T>(chunkLength: number, xs: T[]): T[][]

// Split array into n chunks
chunks<T>(n: number, xs: T[]): T[][]
```

### Object Operations

```typescript
// Create object excluding specified keys
omit<T extends Obj>(ks: string[], x: T): T

// Create object excluding entries with specified values
omitVals<T extends Obj>(xs: any[], x: T): T

// Create object with only specified keys
pick<T extends Obj>(ks: string[], x: T): T

// Transform object keys
mapKeys<T extends Obj>(f: (v: string) => string, x: T): T

// Transform object values
mapVals<V, U>(f: (v: V) => U, x: Record<string, V>): Record<string, U>

// Merge objects (left priority)
mergeLeft<T extends Obj>(a: T, b: T): T

// Merge objects (right priority)
mergeRight<T extends Obj>(a: T, b: T): T

// Deep merge objects
deepMergeLeft(a: Obj, b: Obj): Obj
deepMergeRight(a: Obj, b: Obj): Obj
```

### Number Operations

```typescript
// Convert Maybe<number> to number
num(x: Maybe<number>): number

// Basic arithmetic with Maybe<number>
add(x: Maybe<number>, y: Maybe<number>): number
sub(x: Maybe<number>, y: Maybe<number>): number
mul(x: Maybe<number>, y: Maybe<number>): number
div(x: Maybe<number>, y: number): number

// Increment/Decrement
inc(x: Maybe<number>): number
dec(x: Maybe<number>): number

// Comparisons
lt(x: Maybe<number>, y: Maybe<number>): boolean
lte(x: Maybe<number>, y: Maybe<number>): boolean
gt(x: Maybe<number>, y: Maybe<number>): boolean
gte(x: Maybe<number>, y: Maybe<number>): boolean

// Array number operations
max(xs: Maybe<number>[]): number
min(xs: Maybe<number>[]): number
sum(xs: Maybe<number>[]): number
avg(xs: Maybe<number>[]): number
```

### String Operations

```typescript
// Truncate string with ellipsis
ellipsize(s: string, l: number, suffix = "..."): string

// URL operations
stripProtocol(url: string): string
displayUrl(url: string): string
displayDomain(url: string): string

// Bech32 encoding/decoding
hexToBech32(prefix: string, hex: string): string
bech32ToHex(b32: string): string
```

### Collection Operations

```typescript
// Create union of arrays
union<T>(a: T[], b: T[]): T[]

// Get intersection of arrays
intersection<T>(a: T[], b: T[]): T[]

// Get difference of arrays
difference<T>(a: T[], b: T[]): T[]

// Remove element from array
remove<T>(a: T, xs: T[]): T[]

// Filter array by another array
without<T>(a: T[], b: T[]): T[]

// Toggle element in array
toggle<T>(x: T, xs: T[]): T[]

// Group array by key function
groupBy<T, K>(f: (x: T) => K, xs: T[]): Map<K, T[]>

// Create map from array
indexBy<T, K>(f: (x: T) => K, xs: T[]): Map<K, T>
```

### Time Constants

```typescript
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const QUARTER = 90 * DAY
const YEAR = 365 * DAY

// Get current timestamp in seconds
now(): number

// Get timestamp from ago in seconds
ago(unit: number, count = 1): number

// Convert seconds to milliseconds
ms(seconds: number): number
```

### Function Utilities

```typescript
// Create function that executes once
once(f: (...args: any) => void): (...args: any) => void

// Memoize function results
memoize<T>(f: (...args: any[]) => T): (...args: any[]) => T

// Create throttled function
throttle<F extends (...args: any[]) => any>(
  ms: number,
  f: F
): F

// Create batching function
batch<T>(
  t: number,
  f: (xs: T[]) => void
): (x: T) => void
```

### Network Utilities

```typescript
// Fetch JSON with options
fetchJson(url: string, opts?: FetchOpts): Promise<any>

// Post JSON data
postJson<T>(url: string, data: T, opts?: FetchOpts): Promise<any>

// Upload file
uploadFile(url: string, file: File): Promise<any>
```

## Usage Examples

```typescript
// Array operations
const nums = [1, 2, 2, 3, 3, 3]
uniq(nums) // => [1, 2, 3]

// Object operations
const obj = {a: 1, b: 2, c: 3}
omit(['a', 'b'], obj) // => {c: 3}

// Number operations
add(5, undefined) // => 5
inc(undefined) // => 1

// Time operations
ago(DAY, 2) // => timestamp from 2 days ago

// URL operations
displayUrl('https://www.example.com/') // => 'example.com'

// Collection operations
const users = [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]
indexBy(u => u.id, users) // => Map(1 => {id: 1, name: 'Alice'}, ...)

// Function utilities
const throttledFn = throttle(1000, () => console.log('throttled'))
```
