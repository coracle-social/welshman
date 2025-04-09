# @welshman/net

[![version](https://badgen.net/npm/v/@welshman/net)](https://npmjs.com/package/@welshman/net)

Core networking layer for nostr applications, handling relay connections, message management, and event delivery.

## What's Included

- **Connection Management** - WebSocket lifecycle and relay connections
- **Subscription System** - Event filtering and subscription handling
- **Publishing Tools** - Event broadcasting with status tracking
- **Sync Utilities** - NIP-77 (negentropy) event synchronization
- **Connection Pool** - Shared relay connection management
- **Targets** - Flexible message routing strategies
- **Event Tracking** - Monitor which relays have seen events

## Quick Example

```typescript
import {ctx, setContext} from '@welshman/lib'
import {type TrustedEvent, createEvent, NOTE} from '@welshman/util'
import {subscribe, publish, getDefaultNetContext} from '@welshman/net'

// Sets up customizable event valdation, handlers, etc
setContext(getDefaultNetContext())

// Send a subscription
const sub = subscribe({
  relays: ['wss://relay.example.com/'],
  filters: [{kinds: [1], limit: 1}],
  closeOnEose: true,
  timeout: 10000,
})

sub.on(SubscriptionEvent.Event, (url: string, event: TrustedEvent) => {
  console.log(url, event)
  sub.close()
})

// Publish an event
const pub = publish({
  relays: ['wss://relay.example.com/'],
  event: createEvent(NOTE, {content: 'hi'}),
})

pub.emitter.on('*', (status: PublishStatus, url: string) => {
  console.log(status, url)
})

// The Tracker class can tell you which relays an event was read from or published to
console.log(ctx.net.tracker.getRelays(event.id))
```

The main reason this module exists is to support different backends via Executor and different `target` classes. For example, to add a local relay that automatically gets used:

```typescript
import {setContext} from '@welshman/lib'
import {LOCAL_RELAY_URL, Relay, Repository} from '@welshman/util'
import {getDefaultNetContext, Multi, Local, Relays, Executor} from '@welshman/net'

const repository = new Repository()

const relay = new Relay(repository)

setContext(getDefaultNetContext({
  getExecutor: (relays: string[]) => {
    return new Executor(
      new Multi([
        new Local(relay),
        new Relays(remoteUrls.map(url => ctx.net.pool.get(url))),
      ])
    )
  },
}))
```

## Installation

```bash
npm install @welshman/net
```
