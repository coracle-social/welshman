# DVM Request

The DVM Request module provides utilities for making requests to Data Vending Machines (DVMs) and handling their responses.
It includes support for progress tracking and result handling.

## Core Types

### DVMRequestOptions
```typescript
type DVMRequestOptions = {
  event: SignedEvent       // The event to send to the DVM
  relays: string[]        // Relays to use
  timeout?: number        // Request timeout in milliseconds
  autoClose?: boolean     // Auto-close subscription after result
  reportProgress?: boolean // Listen for progress events
}
```

### DVMEvent Enum
```typescript
enum DVMEvent {
  Progress = "progress", // DVM progress updates (kind 7000)
  Result = "result"     // Final DVM result
}
```

## Making DVM Requests

### Basic Usage
```typescript
import { makeDvmRequest, DVMEvent } from '@welshman/dvm'

const request = makeDvmRequest({
  event: signedEvent,
  relays: ["wss://relay.example.com"],
  timeout: 30000, // 30 seconds
})

// Handle results
request.emitter.on(DVMEvent.Result, (url, event) => {
  console.log('Received result:', event)
})

// Handle progress updates
request.emitter.on(DVMEvent.Progress, (url, event) => {
  console.log('Progress update:', event)
})
```

## Response Handling

### Result Events
```typescript
request.emitter.on(DVMEvent.Result, (url: string, event: TrustedEvent) => {
  // Handle the DVM result
  const result = JSON.parse(event.content)

  // Process tags
  const requestTag = event.tags.find(t => t[0] === 'request')
  const expirationTag = event.tags.find(t => t[0] === 'expiration')
})
```

### Progress Updates
```typescript
request.emitter.on(DVMEvent.Progress, (url: string, event: TrustedEvent) => {
  // Handle progress update (kind 7000)
  const progress = JSON.parse(event.content)
  console.log(`Progress: ${progress.percentage}%`)
})
```

## Complete Example

```typescript
import { makeDvmRequest, DVMEvent } from '@welshman/dvm'
import { createEvent, finalizeEvent } from '@welshman/util'

async function queryDVM() {
  // Create the request event
  const event = createEvent(5001, {
    content: JSON.stringify({
      query: "search terms"
    })
  })

  // Sign the event
  const signedEvent = finalizeEvent(event, privateKey)

  // Make the request
  const dvmRequest = makeDvmRequest({
    event: signedEvent,
    relays: ["wss://relay.example.com"],
    timeout: 30000,
    reportProgress: true
  })

  // Handle progress updates
  dvmRequest.emitter.on(DVMEvent.Progress, (url, event) => {
    console.log('Progress:', event.content)
  })

  // Return a promise that resolves with the result
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      dvmRequest.sub.close()
      reject(new Error('DVM request timeout'))
    }, 30000)

    dvmRequest.emitter.on(DVMEvent.Result, (url, event) => {
      clearTimeout(timeout)
      resolve(event)
    })
  })
}
```


This module simplifies the process of making requests to DVMs while providing flexibility in handling responses and progress updates.
