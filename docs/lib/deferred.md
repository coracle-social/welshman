# Deferred Promises

The `Deferred` module provides utilities for creating promises with exposed resolve/reject functions and typed error handling. This is particularly useful for managing asynchronous operations where you need external control over promise resolution.

## Types

### CustomPromise
```typescript
type CustomPromise<T, E> = Promise<T> & {
  __errorType: E
}
```
A Promise type with strongly typed error information.

### Deferred
```typescript
type Deferred<T, E = T> = CustomPromise<T, E> & {
  resolve: (arg: T) => void
  reject: (arg: E) => void
}
```
A Promise with exposed resolve/reject functions and typed error handling.

## Core Functions

### makePromise
```typescript
function makePromise<T, E>(
  executor: (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason: E) => void
  ) => void
): CustomPromise<T, E>
```

Creates a Promise with strongly typed error information.

### defer
```typescript
function defer<T, E = T>(): Deferred<T, E>
```

Creates a Deferred promise with resolve/reject methods exposed.

## Usage Examples

### Basic Usage

```typescript
// Create a deferred promise
const deferred = defer<string, Error>()

// Resolve later
setTimeout(() => {
  deferred.resolve('Success!')
}, 1000)

// Use like a regular promise
await deferred // => 'Success!'
```

### With Typed Errors

```typescript
interface ApiError {
  code: number
  message: string
}

const request = defer<Response, ApiError>()

try {
  const response = await fetch('/api')
  request.resolve(response)
} catch (error) {
  request.reject({
    code: 500,
    message: error.message
  })
}
```

### External Promise Control

```typescript
class AsyncOperation {
  private ready = defer<boolean>()

  initialize() {
    // Setup async operation
    this.ready.resolve(true)
  }

  async waitUntilReady() {
    return this.ready
  }
}
```

### With Timeout

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = defer<T>()

  setTimeout(() => {
    timeout.reject(new Error('Timeout'))
  }, ms)

  return Promise.race([promise, timeout])
}

// Usage
try {
  const result = await withTimeout(slowOperation(), 5000)
} catch (error) {
  console.log('Operation timed out')
}
```

### Event to Promise

```typescript
function eventToPromise<T>(
  emitter: EventEmitter,
  successEvent: string,
  errorEvent: string
): Deferred<T, Error> {
  const deferred = defer<T, Error>()

  emitter.once(successEvent, (data: T) => {
    deferred.resolve(data)
  })

  emitter.once(errorEvent, (error: Error) => {
    deferred.reject(error)
  })

  return deferred
}
```
