# Adapter

Adapters give requests and publishes one interface to whatever answers them. They are an injection point for custom transports rather than something to use directly.

## Classes

### `AbstractAdapter`

Base class for all adapters. Handles events and cleanup.

- `send(message)` - Send message to relay
- `cleanup()` - Clean up resources
- Emits `AdapterEvent.Receive` when messages arrive

### Built-in Adapters

- `SocketAdapter(socket)` - WebSocket relay connections
- `LocalAdapter(repository)` - A `Repository` answering as a relay at `LOCAL_RELAY_URL`
- `MockAdapter(url, sendHandler)` - Testing with manual control

### Factory

`getAdapter(url, context?)` tries `context.getAdapter` first, then returns a `LocalAdapter` for `LOCAL_RELAY_URL` and a `SocketAdapter` from `context.pool` for relay urls:

```typescript
const adapter = getAdapter('wss://relay.example.com', {pool})
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
  constructor(private url: string) {
    super()

    // Set up an IPFS connection here
  }

  get urls() { return [this.url] }
  get sockets() { return [] }

  send(message: ClientMessage) {
    // Handle messages as if the ipfs backend was a relay, calling
    // this.emit(AdapterEvent.Receive, reply, this.url) with each answer
  }
}
```

Any function that takes a `context`, including `publish` and `request`, accepts a custom adapter factory. When it returns `undefined`, the built-in adapters are used:

```typescript
request({
  relays: ['ipfs://QmTy8w65yBXgyfG2ZBg5TrfB2hPjrDQH3RCQFJGkARStJb'],
  filters: [{kinds: [1]}],
  context: {
    getAdapter: (url: string) => {
      if (url.startsWith('ipfs://')) {
        return new IPFSAdapter(url)
      }
    },
  },
})
```
