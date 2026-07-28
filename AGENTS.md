# Domain

Rules to follow when creating new domain kinds:

- Each kind is a Reader (`extends EventReader`) + Builder (`extends EventBuilder`): readers expose sync getters over `event.tags`, builders are chainable and finish with `toTemplate`/`toEvent`.
- Use `ListReader`/`ListBuilder` only when the kind has private (NIP-44 self-encrypted) entries; otherwise use `EventReader`/`EventBuilder`.
- A reader's `parse()` returns `this` so callers can chain it. Extend `EventReader` (whose `parse` returns `this`) unless parsing needs IO — only decrypting kinds do, and those extend `AsyncEventReader` and return `Promise<this>`, which is what forces callers to await.
- Builders modify tags directly in most cases. Only keep `buildTags` for derived tags (e.g. `TimeEvent`'s `D` day-buckets).
- Drop tags with `spec([key, value])`, not `nthEq(1, value)` — matching the key avoids dropping an unrelated tag that shares the value.
- "Set all" = drop by key then add (`dropTags(spec(["k"])).addTags(...)`); never clear every tag — preserve unmodeled passthrough tags.
- Use `removeUndefined([...])` for optional trailing tag elements instead of emitting `""`.
