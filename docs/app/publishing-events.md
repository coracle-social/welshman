# Thunks

Thunks provide optimistic updates for event publishing. They immediately update the local repository while handling the actual signing and publishing asynchronously, making the UI feel more responsive.

## Overview

A thunk:

- Updates local state immediately
- Handles event signing in the background using the current session
- Tracks publish status per relay
- Supports soft-undo via abort
- Can be delayed/cancelled
- Tracks successful publishes

## Basic Usage

```typescript
import {publishThunk} from '@welshman/app'
import {createEvent, NOTE} from '@welshman/util'

const publish = async (content: string) => {
  // Get optimal relays for publishing
  const relays = ctx.app.router
    .FromUser()
    .getUrls()

  // Create and publish thunk
  const thunk = await publishThunk({
    event: createEvent(NOTE, {content}),
    relays,
    delay: 3000, // 3s window for abort
  })

  // Track publish results
  thunk.subscribe($thunk => {
    for (const [url, result] of Object.entries($thunk.results)) {
      console.log(`${url}: ${result.status} - ${result.detail}`)
    }
  })

  // Can abort within delay window
  setTimeout(() => {
    if (userWantsToCancel) {
      thunk.controller.abort()
    }
  }, 1000)

  // Wait for completion
  await thunk.complete
}
```

## Built in commands

Several thunk factories are provided for common or more complicated scenarios like updating lists:

- `removeRelay(url: string, mode: RelayMode)`
- `addRelay(url: string, mode: RelayMode)`
- `removeInboxRelay(url: string)`
- `addInboxRelay(url: string)`
- `setProfile(profile: Profile)`
- `unfollow(value: string)`
- `follow(tag: string[])`
- `unmute(value: string)`
- `mute(tag: string[])`
- `unpin(value: string)`
- `pin(tag: string[])`
- `sendWrapped({template, pubkeys, ...options}: SendWrappedOptions)`
- `manageRelay(url: string, request: ManagementRequest)`
- `createRoom(url: string, room: RoomMeta)`
- `deleteRoom(url: string, room: RoomMeta)`
- `editRoom(url: string, room: RoomMeta)`
- `joinRoom(url: string, room: RoomMeta)`
- `leaveRoom(url: string, room: RoomMeta)`
