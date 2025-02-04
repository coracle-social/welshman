# Commands

High-level commands for common Nostr operations.
Each command handles signing, encryption, and relay selection automatically.

## Available Commands

```typescript
// List Management
follow(pubkey)
unfollow(pubkey)
mute(pubkey)
unmute(pubkey)
pin(tag)
unpin(tag)
```

Each command returns a [`Thunk`](app/thunk) which:
- Optimistically updates local state
- Signs and publishes the event
- Can be aborted within a delay window
- Reports publish progress

## Real World Examples

### Following/Unfollowing Users

```typescript
import {follow, unfollow, userFollows} from '@welshman/app'

// Follow with optimistic update
const followUser = async (pubkey: string) => {

  // Creates and publishes event with an updated follow list
  const thunk = await follow(pubkey)

  // Track publish status per relay
  thunk.status.subscribe(statuses => {
    for (const [url, status] of Object.entries(statuses)) {
      console.log(`${url}: ${status}`)
    }
  })

  // Can abort within delay window
  setTimeout(() => thunk.controller.abort(), 1000)
}

// Unfollow works the same way
const unfollowUser = async (pubkey: string) => {
  const thunk = await unfollow(pubkey)

  // Wait for completion
  const results = await thunk.result
}
```

### Managing Pins

```typescript
import {pin, unpin, userPins} from '@welshman/app'

// Pin an event with context
const pinEvent = async (event: TrustedEvent) => {
  const thunk = await pin([
    'e', event.id,
    ctx.app.router.Event(event).getUrl()
  ])

  // Handle specific relay errors
  thunk.status.subscribe(statuses => {
    for (const [url, {status, message}] of Object.entries(statuses)) {
      if (status === 'failure') {
        console.error(`Failed on ${url}: ${message}`)
      }
    }
  })
}
```

All commands:
- Handle encryption automatically
- Select appropriate relays
- Update local state immediately
- Allow soft-undo via abort
- Report per-relay status
- Return consistent Thunk interface

Commands provide a high-level way to modify the Nostr state without dealing with the complexities of event creation, encryption, and relay selection.
