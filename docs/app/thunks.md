# Thunks

Thunks provide optimistic updates for event publishing. They immediately update the local repository while handling the actual signing and publishing asynchronously, making the UI feel more responsive.

## Overview

A thunk:
- Updates local state immediately
- Handles event signing in the background
- Manages publish status per relay
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

  // Track publish status
  thunk.status.subscribe(statuses => {
    for (const [url, {status, message}] of Object.entries(statuses)) {
      console.log(`${url}: ${status} ${message}`)
    }
  })

  // Can abort within delay window
  setTimeout(() => {
    if (userWantsToCancel) {
      thunk.controller.abort()
    }
  }, 1000)

  // Wait for completion
  const results = await thunk.result
  return results
}
```
