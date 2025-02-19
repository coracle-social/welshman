# Pool

The Pool class manages a collection of relay connections, providing a centralized way to track and reuse connections across your application.

## Overview

- Creates and caches connections
- Ensures single connection per relay
- Handles cleanup of unused connections
- Provides connection lookup

## Usage

```typescript
import {Pool} from '@welshman/net'

// Create pool
const pool = new Pool()

// Get or create connection
const connection = pool.get("wss://relay.example.com")

// Check if relay is in pool
if (pool.has("wss://relay.example.com")) {
  // Use existing connection
}

// Remove connection
pool.remove("wss://relay.example.com")

// Clear all connections
pool.clear()
```


The Pool is typically used internally by the router and executor, but can be used directly for custom connection management.
It ensures efficient connection reuse across your application.
