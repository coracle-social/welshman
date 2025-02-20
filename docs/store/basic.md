# Basic Utilities

## synced
Creates a writable store that automatically synchronizes its value with localStorage.

```typescript
const myStore = synced('storage-key', 'default value');
```

## getter
Creates a function that returns the current value of a store without subscribing to it.

```typescript
const myStore = writable('value');
const getValue = getter(myStore);

```

## withGetter
Enhances a store by adding a getter method to access its current value.

```typescript
const myStore = withGetter(writable('value'));
console.log(myStore.get()); // 'value'
```

## throttled
Creates a store that limits how often subscribers receive updates.

```typescript
const throttledStore = throttled(1000, myStore); // Updates at most once per second
```

## custom
Creates a custom store with optional throttling and custom set behavior.

```typescript
const customStore = custom(
  set => {
    // Setup logic
    return () => {
      // Cleanup logic
    };
  },
  { throttle: 1000 }
);
```

## adapter
Creates a derived store that can transform values between two types while maintaining two-way binding.

```typescript
const adaptedStore = adapter({
  store: originalStore,
  forward: (source) => /* transform to target */,
  backward: (target) => /* transform back to source */
});
```

This is particularly useful when you need to transform data structures while maintaining the ability to update the original store.
