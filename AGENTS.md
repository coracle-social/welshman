# Domain

Rules to follow when creating new domain kinds:

- Each kind is a Reader (`extends EventReader`) + Writer (`extends EventWriter`) + Query (`extends EventQuery`), bundled by a `KindFactory` exported from `src/kinds/<Kind>.ts` and re-exported from `src/index.ts`. Its kind number belongs in `@welshman/util`'s `Kinds.ts`.
- Readers expose sync getters over `event.tags`. Writers are chainable and render via `renderTemplate()` (a template) or `render()` (a template plus its relays). Queries are chainable and render via `renderFilters()` (filters) or `render()` (filters plus the relays to request them from).
- A Query takes its kind from the factory and must implement `renderRoutes`, composed from `authorRoutes`/`mentionRoutes`. Add `indexers()` for indexed kinds; return `[]` for kinds that only exist on the relay hosting them. Never fall back to the user's relays, which is the caller's decision via `setRoutes`/`addRoutes`.
- Beyond that a Query is usually empty. Add methods only for relationships the kind models (`CommentQuery.forRoot(event)`), overriding `renderDomainFilters` for the filters they need.
- Use `ListReader`/`ListWriter` only when the kind has private (NIP-44 self-encrypted) entries; otherwise use `EventReader`/`EventWriter`.
- A reader's `parse()` returns `this` so callers can chain it. Extend `EventReader` (whose `parse` returns `this`) unless parsing needs IO — only decrypting kinds do, and those extend `AsyncEventReader` and return `Promise<this>`, which is what forces callers to await.
- Writers modify tags directly in most cases. Only override `renderDomainTags` for derived tags (e.g. `TimeEvent`'s `D` day-buckets) — the base class's `renderBehaviorTags` already covers `h`/`d`/`-`/`expiration`/`content-warning`/`client`.
- Readers are lenient, writers are strict: a reader drops what it doesn't understand so an event using a newer variant is still partly usable, while a writer throws from `validate()` rather than emitting one.
- Drop tags with `spec([key, value])`, not `nthEq(1, value)` — matching the key avoids dropping an unrelated tag that shares the value.
- "Set all" = drop by key then add (`dropTags(spec(["k"])).addTags(...)`); never clear every tag — preserve unmodeled passthrough tags.
- Use `removeUndefined([...])` for optional trailing tag elements instead of emitting `""`.
- Parsing that doesn't need an event (a content grammar, a tag value's own syntax) belongs in `@welshman/util`, so packages that don't depend on `domain` can use it too.
