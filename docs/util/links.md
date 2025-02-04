# Links

A small module for handling Nostr URI manipulation.

## Core Functions

### fromNostrURI
```typescript
function fromNostrURI(s: string): string

// Examples
fromNostrURI('nostr:npub1...') // => 'npub1...'
fromNostrURI('nostr://npub1...') // => 'npub1...'
fromNostrURI('note1...') // => 'note1...'
```
Removes the `nostr:` or `nostr://` protocol prefix from a Nostr URI.

### toNostrURI
```typescript
function toNostrURI(s: string): string

// Examples
toNostrURI('npub1...') // => 'nostr:npub1...'
toNostrURI('nostr:npub1...') // => 'nostr:npub1...' (unchanged)
```
Ensures a string has the `nostr:` protocol prefix.
