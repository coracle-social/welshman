# Repository

`Repository` is an in-memory, indexed event store. It applies NIP-09 deletes, NIP-40 expiration and replaceable-event semantics, and emits a diff whenever its contents change. An [`App`](../app/app#iapp) owns one as `app.repository`, and [`@welshman/store`](../store/repository) derives Svelte stores from it.

## Repository

**Events:**
- `"update"` - Emitted with a `RepositoryUpdate` whenever events are added or removed
- `"clear"` - Emitted by `clear()`

**Methods:**
- `publish(event, {shouldNotify = true})` - Stores an event and returns whether it changed anything. It returns `false` for an event it already holds unchanged, or one older than the stored version at the same address. An event under a stored id with different content, such as an unsigned event gaining its signature, replaces the stored copy in place
- `query(filters, {includeDeleted = false, includeExpired = false, shouldSort = true})` - Returns the events matching any filter, newest first unless `shouldSort` is `false`. Each filter's `limit` applies to that filter
- `getEvent(idOrAddress)` - Looks an event up by id, or by address (`kind:pubkey:d`) for a replaceable
- `hasEvent(event)` - Whether the repository holds this event, or a version at its address at least as new
- `removeEvent(idOrAddress)` - Removes an event from every index, restores the version it replaced, and withdraws any deletes it asserted
- `isDeleted(event)` - Whether a delete hides the event; `isDeletedById` and `isDeletedByAddress` check one path each
- `isExpired(event)` - Whether the event's `expiration` tag is in the past
- `dump()` - Every stored event
- `load(events)` - Adds events to those already stored and emits a single `"update"`. Call `clear()` first to replace the contents
- `clear()` - Empties every index

## Indexes

Events are indexed by id, by address (replaceables only), by author, by kind, by day of `created_at`, and by each single-letter tag's first value. `query` narrows each filter through the first index that applies, in the order `ids`, `authors`, single-letter tag, `kinds`, `since`/`until`, and scans every event when none does.

## Deletes and replaceables

A kind 5 event deletes the ids and addresses in its `e` and `a` tags. The delete hides only events by its own author, and an address delete hides only versions older than the delete. The repository records a delete whether or not it holds the target, so a target that arrives later is still hidden. Deleted events stay stored, and `query` skips them unless `includeDeleted` is set.

A newer event at an address replaces the stored one, which the repository treats as deleted by its successor. Removing the newer event restores the older one. Expired events likewise stay stored and are skipped by `query` unless `includeExpired` is set.

## LOCAL_RELAY_URL

`LOCAL_RELAY_URL` (`"local://welshman.relay/"`) names the repository as a relay. With a repository in the `context`, [`getAdapter`](./adapter) answers that url with a `LocalAdapter`, so `request`, `publish` and `count` read and write the repository through the same path as a remote relay. An open subscription receives events matching its filters as the repository adds them.

## RepositoryUpdate

```typescript
type RepositoryUpdate = {
  added: TrustedEvent[]
  removed: Set<string>
}
```

`mergeRepositoryUpdates(updates)` folds several updates into one, where a later update wins for an id that appears in both lists.

## Example

```typescript
import {on} from "@welshman/lib"
import {Repository, LOCAL_RELAY_URL, request} from "@welshman/net"

const repository = new Repository()

on(repository, "update", ({added, removed}) => {
  console.log(`${added.length} added, ${removed.size} removed`)
})

repository.load(storedEvents)

const notes = repository.query([{kinds: [1], authors: [pubkey], limit: 20}])

request({
  relays: [LOCAL_RELAY_URL],
  filters: [{kinds: [1]}],
  context: {repository},
  onEvent: event => console.log("stored", event.id),
})
```
