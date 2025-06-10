# Adapter

Adapters provide a unified interface for communicating with relays. Adapters aren't meant to be used directly, but as an injection point for custom logic.

## Core Classes

### `AbstractAdapter`

Base class for all adapters. Handles events and cleanup.

- `send(message)` - Send message to relay
- `cleanup()` - Clean up resources
- Emits `AdapterEvent.Receive` when messages arrive

### Built-in Adapters

- `SocketAdapter(socket)` - WebSocket relay connections
- `LocalAdapter(relay)` - Local in-memory relays
- `MockAdapter(url, sendHandler)` - Testing with manual control

### Factory

`getAdapter(url, context?)` creates the appropriate adapter:

```typescript
const adapter = getAdapter('wss://relay.example.com')
adapter.on(AdapterEvent.Receive, (message, url) => {
  console.log('Received:', message)
})
adapter.send(['REQ', 'sub1', {}])
adapter.cleanup()
```

## Custom Adapter Example

Custom adapters can be created against any target:

```typescript
class IPFSAdapter extends AbstractAdapter {
  constructor(private url string) {
    super()

    // Set up an IPFS connection here
  }

  get urls() { return [this.url] }
  get sockets() { return [] }

  send(message: ClientMessage) {
    // Handle messages as if the ipfs backend was a relay
  }
}
```

Custom adapters can also be provided to several net utilities, including `publish` and `request`:

```typescript
request({
  relays: ['ipfs://QmTy8w65yBXgyfG2ZBg5TrfB2hPjrDQH3RCQFJGkARStJb'],
  filters: [{kinds: [1]}],
  context: {
    getAdapter: (url: string) => {
      // getAdapter optionally returns an adapter. If none is returned, the stock adapters will be used.
      if (url.startsWith('ipfs://')) {
        return new IPFSAdapter(url)
      }
    },
  },
})
```
