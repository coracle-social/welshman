# Utility Functions

The `Tools` module provides a comprehensive collection of utility functions for common programming tasks. It includes functions for array manipulation, object handling, type checking, math operations, and more.

## Basic functional programming utilities

```typescript
// Function that does nothing and returns undefined
export declare const noop: (...args: unknown[]) => undefined;

// Returns the input value unchanged
export declare const identity: <T>(x: T, ...args: unknown[]) => T;

// Creates a function that always returns the same value
export declare const always: <T>(x: T, ...args: unknown[]) => () => T;

// Returns the logical NOT of a value
export declare const not: (x: any, ...args: unknown[]) => boolean;

// Deep equality comparison
export declare const equals: (a: any, b: any) => boolean;
```

## Numbers

```typescript
// Converts string or number to number
export declare const ensureNumber: (x: number | string) => number;

// Converts a `number | undefined` to a number, defaulting to 0
export declare const num: (x: number | undefined) => number;

// Adds two numbers, handling undefined values
export declare const add: (x: number | undefined, y: number | undefined) => number;

// Subtracts two numbers, handling undefined values
export declare const sub: (x: number | undefined, y: number | undefined) => number;

// Multiplies two numbers, handling undefined values
export declare const mul: (x: number | undefined, y: number | undefined) => number;

// Divides two numbers, handling undefined values
export declare const div: (x: number | undefined, y: number) => number;

// Increments a number by 1, handling undefined values
export declare const inc: (x: number | undefined) => number;

// Decrements a number by 1, handling undefined values
export declare const dec: (x: number | undefined) => number;

// Less than comparison, handling undefined values
export declare const lt: (x: number | undefined, y: number | undefined) => boolean;

// Less than or equal comparison, handling undefined values
export declare const lte: (x: number | undefined, y: number | undefined) => boolean;

// Greater than comparison, handling undefined values
export declare const gt: (x: number | undefined, y: number | undefined) => boolean;

// Greater than or equal comparison, handling undefined values
export declare const gte: (x: number | undefined, y: number | undefined) => boolean;

// Returns maximum value in array, handling undefined values
export declare const max: (xs: (number | undefined)[]) => number;

// Returns minimum value in array, handling undefined values
export declare const min: (xs: (number | undefined)[]) => number;

// Returns sum of array values, handling undefined values
export declare const sum: (xs: (number | undefined)[]) => number;

// Returns average of array values, handling undefined values
export declare const avg: (xs: (number | undefined)[]) => number;

// Checks if a number is between two values (exclusive)
export declare const between: ([low, high]: [number, number], n: number) => boolean;

// Checks if a number is between two values (inclusive)
export declare const within: ([low, high]: [number, number], n: number) => boolean;

// Constrains number between min and max values
export declare const clamp: ([min, max]: [number, number], n: number) => number;

// Round a number to the nearest float precision
export declare const round: (precision: number, x: number) => number;
```

## Timestamps

```typescript
// One minute in seconds
export declare const MINUTE = 60;

// One hour in seconds
export declare const HOUR: number;

// One day in seconds
export declare const DAY: number;

// One week in seconds
export declare const WEEK: number;

// One month in seconds (approximate)
export declare const MONTH: number;

// One quarter in seconds (approximate)
export declare const QUARTER: number;

// One year in seconds (approximate)
export declare const YEAR: number;

// Multiplies time unit by count
export declare const int: (unit: number, count?: number) => number;

// Returns current Unix timestamp in seconds
export declare const now: () => number;

// Returns Unix timestamp from specified time ago
export declare const ago: (unit: number, count?: number) => number;

// Converts seconds to milliseconds
export declare const ms: (seconds: number) => number;
```

## Sequences

```typescript
// Returns the first element of an array
export declare const first: <T>(xs: Iterable<T>, ...args: unknown[]) => T | undefined;

// Returns the first element of the first array in a nested array
export declare const ffirst: <T>(xs: Iterable<Iterable<T>>, ...args: unknown[]) => T | undefined;

// Returns the last element of an array
export declare const last: <T>(xs: Iterable<T>, ...args: unknown[]) => T;

// Returns array with first n elements removed
export declare const drop: <T>(n: number, xs: Iterable<T>) => T[];

// Returns first n elements of array
export declare const take: <T>(n: number, xs: Iterable<T>) => T[];

// Concatenates multiple arrays, filtering out null/undefined
export declare const concat: <T>(...xs: T[][]) => T[];

// Appends element to array
export declare const append: <T>(x: T, xs: T[]) => T[];

// Creates union of two arrays
export declare const union: <T>(a: T[], b: T[]) => T[];

// Returns elements common to both arrays
export declare const intersection: <T>(a: T[], b: T[]) => T[];

// Returns elements in first array not present in second
export declare const difference: <T>(a: T[], b: T[]) => T[];

// Removes all instances of an element from array
export declare const remove: <T>(a: T, xs: T[]) => T[];

// Returns elements from second array not present in first
export declare const without: <T>(a: T[], b: T[]) => T[];

// Toggles presence of element in array
export declare const toggle: <T>(x: T, xs: T[]) => T[];

// Generates sequence of numbers from a to b
export declare function range(a: number, b: number, step?: number): Generator<number, void, unknown>;

// Yields indexed items
export declare function enumerate<T>(items: T[]): Generator<[number, T], void, unknown>;

// Returns a function that gets property value from object
export declare const pluck: <T>(k: string, xs: Record<string, unknown>[]) => T[];

// Creates object from array of key-value pairs
export declare const fromPairs: <T>(pairs: [k?: string, v?: T, ...args: unknown[]][]) => Record<string, T>;

// Flattens array of arrays into single array
export declare const flatten: <T>(xs: T[][]) => T[];

// Splits array into two arrays based on predicate
export declare const partition: <T>(f: (x: T) => boolean, xs: T[]) => T[][];

// Returns array with duplicate elements removed
export declare const uniq: <T>(xs: T[]) => T[];

// Returns array with elements unique by key function
export declare const uniqBy: <T>(f: (x: T) => any, xs: T[]) => T[];

// Returns sorted copy of array
export declare const sort: <T>(xs: T[]) => T[];

// Returns array sorted by key function
export declare const sortBy: <T>(f: (x: T) => any, xs: T[]) => T[];

// Groups array elements by key function
export declare const groupBy: <T, K>(f: (x: T) => K, xs: T[]) => Map<K, T[]>;

// Creates map from array using key function
export declare const indexBy: <T, K>(f: (x: T) => K, xs: T[]) => Map<K, T>;

// Creates array of specified length using generator function
export declare const initArray: <T>(n: number, f: () => T) => T[];

// Splits array into chunks of specified length
export declare const chunk: <T>(chunkLength: number, xs: T[]) => T[][];

// Splits array into specified number of chunks
export declare const chunks: <T>(n: number, xs: T[]) => T[][];

// Splits array into two parts at index
export declare const splitAt: <T>(n: number, xs: T[]) => T[][];

// Inserts element into array at index
export declare const insert: <T>(n: number, x: T, xs: T[]) => T[];

// Returns random element from array
export declare const choice: <T>(xs: T[]) => T;

// Returns shuffled copy of iterable
export declare const shuffle: <T>(xs: Iterable<T>) => T[];

// Returns n random elements from array
export declare const sample: <T>(n: number, xs: T[]) => T[];

// Checks if value is iterable
export declare const isIterable: (x: any) => boolean;

// Ensures value is iterable by wrapping in array if needed
export declare const toIterable: (x: any) => any;

// Ensures value is array by wrapping if needed
export declare const ensurePlural: <T>(x: T | T[]) => T[];
```

## Objects

```typescript
// Checks if value is a plain object
export declare const isPojo: (obj: any) => boolean;

// Creates new object with only specified keys
export declare const pick: <T extends Obj>(ks: string[], x: T) => T;

// Creates new object with specified keys removed
export declare const omit: <T extends Obj>(ks: string[], x: T) => T;

// Creates new object excluding entries with specified values
export declare const omitVals: <T extends Obj>(xs: any[], x: T) => T;

// Filters object values based on predicate
export declare const filterVals: <T extends Record<string, any>>(f: (v: any) => boolean, x: T) => T;

// Creates new object with transformed keys
export declare const mapKeys: <T extends Obj>(f: (v: string) => string, x: T) => T;

// Creates new object with transformed values
export declare const mapVals: <V, U>(f: (v: V) => U, x: Record<string, V>) => Record<string, U>;

// Merges two objects, with left object taking precedence
export declare const mergeLeft: <T extends Obj>(a: T, b: T) => T;

// Merges two objects, with right object taking precedence
export declare const mergeRight: <T extends Obj>(a: T, b: T) => T;

// Deep merge two objects, prioritizing the first argument.
export declare const deepMergeLeft: (a: Obj, b: Obj) => Obj<any>;

// Deep merge two objects, prioritizing the second argument.
export declare const deepMergeRight: (a: Obj, b: Obj) => Obj<any>;

// Switches on key in object, with default fallback
export declare const switcher: <T>(k: string, m: Record<string, T>) => T;
```

## Combinators

```typescript
// Returns a function that returns the boolean negation of the given function
export declare const complement: <T extends unknown[]>(f: (...args: T) => any) => (...args: T) => boolean;

// Safely executes function and handles errors
export declare const tryCatch: <T>(f: () => T, onError?: (e: Error) => void) => T | undefined;

// Creates function that only executes once
export declare const once: (f: (...args: any) => void) => (...args: any) => void;

// Calls a function
export declare const call: <T>(f: () => T, ...args: unknown[]) => T;

// Memoizes function results based on arguments
export declare const memoize: <T>(f: (...args: any[]) => T) => (...args: any[]) => T;

// Executes a function if the value is defined
export declare const ifLet: <T>(x: T | undefined, f: (x: T) => void) => void;
```

## Randomness

```typescript
// Generates random integer between min and max (inclusive)
export declare const randomInt: (min?: number, max?: number) => number;

// Generates random string ID
export declare const randomId: () => string;
```

## Async

```typescript
// Creates a promise that resolves after specified time
export declare const sleep: (t: number) => Promise<unknown>;

// Creates a microtask that yields to other tasks in the event loop
export declare const yieldThread: () => any;

// Creates throttled version of function
export declare const throttle: <F extends (...args: any[]) => any>(ms: number, f: F) => F | ((...thisArgs: Parameters<F>) => void);

// Creates throttled function that returns cached value
export declare const throttleWithValue: <T>(ms: number, f: () => T) => () => T;

// Creates batching function that collects items
export declare const batch: <T>(t: number, f: (xs: T[]) => void) => (x: T) => void;

// Creates batching function that returns results
export declare const batcher: <T, U>(t: number, execute: (request: T[]) => U[] | Promise<U[]>) => (request: T) => Promise<U>;
```

## URLs

```typescript
// Removes protocol (http://, https://, etc) from URL
export declare const stripProtocol: (url: string) => string;

// Formats URL for display by removing protocol, www, and trailing slash
export declare const displayUrl: (url: string) => string;

// Extracts and formats domain from URL
export declare const displayDomain: (url: string) => string;
```

## JSON, localStorage, fetch, event emitters, etc

```typescript
// Safely parses JSON string
export declare const parseJson: (json: string | undefined) => any;

// Gets and parses JSON from localStorage
export declare const getJson: (k: string) => any;

// Stringifies and stores value in localStorage
export declare const setJson: (k: string, v: any) => void;

// Options for fetch requests
type FetchOpts = {
    method?: string;
    headers?: Record<string, string | boolean>;
    body?: string | FormData;
};

// Fetches JSON from URL with options
export declare const fetchJson: (url: string, opts?: FetchOpts) => Promise<any>;

// Posts JSON data to URL
export declare const postJson: <T>(url: string, data: T, opts?: FetchOpts) => Promise<any>;

// Uploads file to URL
export declare const uploadFile: (url: string, file: File) => Promise<any>;

// A generic type-safe event listener function that works with event emitters.
export declare const on: <EventMap extends Record<string | symbol, any[]>, E extends keyof EventMap>(target: {
    on(event: E, listener: (...args: EventMap[E]) => any): any;
    off(event: E, listener: (...args: EventMap[E]) => any): any;
}, eventName: E, callback: (...args: EventMap[E]) => void) => (() => void);
```

## Strings

```typescript
// Truncates string to length, breaking at word boundaries
export declare const ellipsize: (s: string, l: number, suffix?: string) => string;

// Generates a hash string from input string
export declare const hash: (s: string) => string;
```

## Curried utilities for working with collections

```typescript
// Returns a function that gets the nth element of an array
export declare const nth: (i: number) => <T>(xs: T[], ...args: unknown[]) => T;

// Returns a function that checks if nth element equals value
export declare const nthEq: (i: number, v: any) => (xs: any[], ...args: unknown[]) => boolean;

// Returns a function that checks if nth element does not equal value
export declare const nthNe: (i: number, v: any) => (xs: any[], ...args: unknown[]) => boolean;

// Returns a function that checks if key/value pairs of x match all pairs in spec
export declare const spec: (values: Obj | Array<any>) => (x: Obj | Array<any>, ...args: unknown[]) => boolean;

// Returns a function that checks equality with value
export declare const eq: <T>(v: T) => (x: T) => boolean;

// Returns a function that checks inequality with value
export declare const ne: <T>(v: T) => (x: T) => boolean;

// Returns a function that gets property value from object
export declare const prop: <T>(k: string) => (x: Record<string, unknown>) => T;

// Returns a function that adds/updates a property on object
export declare const assoc: <K extends string, T, U>(k: K, v: T) => (o: U) => U & Record<K, T>;

// Returns a function that removes a property on object
export declare const dissoc: <K extends string, T extends Obj>(k: K) => (o: T) => T;
```

## Sets

```typescript
// Adds value to Set at key in object
export declare const addToKey: <T>(m: Record<string, Set<T>>, k: string, v: T) => void;

// Pushes value to array at key in object
export declare const pushToKey: <T>(m: Record<string, T[]>, k: string, v: T) => void;
```

## Maps

```typescript
// Adds value to Set at key in Map
export declare const addToMapKey: <K, T>(m: Map<K, Set<T>>, k: K, v: T) => void;

// Pushes value to array at key in Map
export declare const pushToMapKey: <K, T>(m: Map<K, T[]>, k: K, v: T) => void;
```

## Bech32 <-> hex encoding

```typescript
// Converts hex string to bech32 format
export declare const hexToBech32: (prefix: string, hex: string) => `${Lowercase<string>}1${string}`;

// Converts bech32 string to hex format
export declare const bech32ToHex: (b32: string) => string;
```

