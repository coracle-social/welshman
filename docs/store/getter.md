# Getter

Utilities for adding synchronous `get()` methods to Svelte stores, allowing immediate value access without subscribing. Note that this has performance implications, since it will activate a subscription that will never get unsubscribed. Do not use this on stores that require complex calculations, or which are created and destroyed.

## Functions

### getter(store)

Creates a getter function that returns the current value of a store.

**Parameters:**
- `store` - Any readable Svelte store

**Returns:** Function that returns the current store value

### withGetter(store)

Enhances a store by adding a synchronous `get()` method.

**Parameters:**
- `store` - Readable or writable Svelte store

**Returns:** Store with added `get()` method

## Types

- `ReadableWithGetter<T>` - Readable store with `get()` method
- `WritableWithGetter<T>` - Writable store with `get()` method

## Example

```typescript
import {writable, derived} from "svelte/store"
import {withGetter, getter} from "@welshman/store"

// Create enhanced stores with getter methods
const count = withGetter(writable(0))
const doubled = withGetter(derived(count, $count => $count * 2))

// Access values synchronously without subscribing
console.log(count.get()) // 0
console.log(doubled.get()) // 0

// Update the store
count.set(5)

// Get updated values immediately
console.log(count.get()) // 5
console.log(doubled.get()) // 10

// Alternative: create getter function separately
const regularStore = writable(42)
const getValue = getter(regularStore)
console.log(getValue()) // 42
```
