# Tags

The Tags module provides utilities for selecting and reading values out of a Nostr event's `tags` array. It is built around a small `TagSpec` descriptor: you build a spec (optionally typed), then pass it together with a `tags` array to a selector.

## TagSpec

A `TagSpec` describes which tags to match and how to read their value:

```typescript
type TagSpec<T = string> = {
  keys: string[]                          // tag names to match (tag[0])
  matchValue?: (value: string) => boolean // optional filter on tag[1]
  normalizeValue?: (value: string) => T   // optional transform of tag[1]
}

// Build a spec. `keys` accepts a single string or an array.
tagSpec(keys: string | string[], matchValue?, normalizeValue?): TagSpec
```

### Typed spec builders

Shortcuts for the common value types. Each pins `keys` and an appropriate `matchValue`/`normalizeValue`:

```typescript
hexTags(keys)      // matchValue = isHex32           — 32-byte hex (e/p tags, ids, pubkeys)
addressTags(keys)  // matchValue = Address.isAddress — replaceable addresses (a tags)
relayTags(keys)    // matchValue = isRelayUrl        — relay urls (r/relay tags)
topicTags(keys)    // normalizeValue strips a leading "#" (t tags)
kindTags(keys)     // values are parsed to `number` (k tags)
```

## Selecting and reading

```typescript
// All tags matching the spec
matchTags(spec, tags): string[][]

// First tag matching the spec, or undefined
matchTag(spec, tags): string[] | undefined

// Values (tag[1], normalized) of all matching tags; undefined values are dropped
tagValues(spec, tags): T[]

// Value (tag[1], normalized) of the first matching tag, or undefined
tagValue(spec, tags): T | undefined
```

`tagMatcher(spec)` and `tagValueExtractor(spec)` return the underlying `(tag) => boolean` predicate and `(tag) => T` reader if you need them directly.

`tagValueMatcher(spec, value)` narrows that predicate to one value, compared after normalization. Use it to find or drop a tag by value — a relay tagged `wss://nos.lol` matches `wss://nos.lol/`, where a raw comparison would not.

## Example

```typescript
import {tagSpec, hexTags, topicTags, relayTags, tagValue, tagValues} from "@welshman/util"

// Values of specific tag types
const pubkeys = tagValues(hexTags("p"), event.tags)     // string[]
const topics = tagValues(topicTags("t"), event.tags)    // "#nostr" -> "nostr"
const relays = tagValues(relayTags(["r", "relay"]), event.tags)

// Match multiple keys at once
const refs = matchTags(tagSpec(["p", "e"]), event.tags)

// Single value
const title = tagValue(tagSpec("title"), event.tags)    // string | undefined
```

## See also

Thread-reference helpers are kind-specific and live in [`@welshman/domain`](../domain/content), not here: `getReplyTags`/`getReplyTagValues` (NIP-10, on kind 1) and `getCommentTags`/`getCommentTagValues` (NIP-22, on kind 1111).
