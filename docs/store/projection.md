# Projection

A `Projection<T>` is a value that can be read synchronously or reactively. It is a store itself, so `derived(someProjection, ...)` works as well as `derived(someProjection.$, ...)`.

```typescript
type Projection<T> = Readable<T> & {
  get: () => T          // synchronous "hot" snapshot
  $: Readable<T>        // a Svelte readable for subscriptions / $-syntax
}
```

```typescript
const display = app.use(Profiles).display(pubkey)

display.get()           // string, right now
display.$               // Readable<string>, for `$display` in a component
```

```typescript
// Wrap a Readable into a Projection (default getter is hot-path aware)
projection<T>($: Readable<T>, get?): Projection<T>

// Derive one Projection from another, preserving both access modes
projectFrom<S, U>(src: Projection<S>, read: ($: S) => U): Projection<U>
```

The default `get` is [`getter($)`](./getter), which caches the store value on hot paths, so `.get()` is cheap to call repeatedly.
