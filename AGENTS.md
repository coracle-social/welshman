# Domain

Rules to follow when creating new domain kinds:

- Each kind is a Reader (`extends EventReader`) + Writer (`extends EventWriter`), paired by a `KindFactory` exported from `src/kinds/<Kind>.ts` and re-exported from `src/index.ts`. Its kind number belongs in `@welshman/util`'s `Kinds.ts`.
- Readers expose sync getters over `event.tags`. Writers are chainable and render via `renderTemplate()` (a template) or `render()` (a template plus its relays).
- Use `ListReader`/`ListWriter` only when the kind has private (NIP-44 self-encrypted) entries; otherwise use `EventReader`/`EventWriter`.
- A reader's `parse()` returns `this` so callers can chain it. Extend `EventReader` (whose `parse` returns `this`) unless parsing needs IO — only decrypting kinds do, and those extend `AsyncEventReader` and return `Promise<this>`, which is what forces callers to await.
- Writers modify tags directly in most cases. Only override `renderDomainTags` for derived tags (e.g. `TimeEvent`'s `D` day-buckets) — the base class's `renderBehaviorTags` already covers `h`/`d`/`-`/`expiration`.
- Readers are lenient, writers are strict: a reader drops what it doesn't understand so an event using a newer variant is still partly usable, while a writer throws from `validate()` rather than emitting one.
- Drop tags with `spec([key, value])`, not `nthEq(1, value)` — matching the key avoids dropping an unrelated tag that shares the value.
- "Set all" = drop by key then add (`dropTags(spec(["k"])).addTags(...)`); never clear every tag — preserve unmodeled passthrough tags.
- Use `removeUndefined([...])` for optional trailing tag elements instead of emitting `""`.
- Parsing that doesn't need an event (a content grammar, a tag value's own syntax) belongs in `@welshman/util`, so packages that don't depend on `domain` can use it too.
