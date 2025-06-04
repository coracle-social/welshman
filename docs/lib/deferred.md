# Deferred Promises

The `Deferred` module provides utilities for creating promises with exposed resolve/reject functions and typed error handling. This is particularly useful for managing asynchronous operations where you need external control over promise resolution.

## API

```typescript
// Creates a Deferred promise
export declare const defer: <T, E = T>() => Deferred<T, E>;

// Promise with exposed resolve/reject functions and typed error
export type Deferred<T, E = T> = CustomPromise<T, E> & {
  resolve: (arg: T) => void;
  reject: (arg: E) => void;
};

// Creates a Promise with strongly typed error
export declare function makePromise<T, E>(
  executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason: E) => void) => void,
): CustomPromise<T, E>;
```

## Example

```typescript
import { defer } from '@welshman/lib';

// Create a deferred promise
const deferred = defer<string>();

// Resolve it externally
setTimeout(() => {
  deferred.resolve('Hello, world!');
}, 1000);

// Use it like a regular promise
deferred.then(value => {
  console.log(value); // "Hello, world!"
});
```
