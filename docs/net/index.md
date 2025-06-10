# @welshman/net

[![version](https://badgen.net/npm/v/@welshman/net)](https://npmjs.com/package/@welshman/net)

Core networking layer for nostr applications, handling relay connections, message management, and event delivery.

## What's Included

- **Connection Management** - WebSocket lifecycle and relay connections
- **Subscription System** - Event filtering and subscription handling
- **Publishing Tools** - Event broadcasting with status tracking
- **Sync Utilities** - NIP-77 (negentropy) event synchronization
- **Connection Pool** - Shared relay connection management
- **Custom Adapters** - Flexible adapter layer to support queries against any target
- **Event Tracking** - Monitor which relays have seen events
- **Socket policies** - Default and customizable policies for NIP 42 AUTH, reconnects, etc
