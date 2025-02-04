# Feed

The feed system provides a powerful way to compose and load complex `Nostr` queries. It supports user scopes, web of trust filtering, DVM integration, and thread construction.

## Controller

The `controller.load()` function is the main interface for fetching events from a feed. It handles all the complexity of relay selection, subscription management, and event filtering.

```typescript
import {createFeedController} from '@welshman/app'
import {scopeFeed, wotFeed} from '@welshman/feeds'

const controller = createFeedController({
  // Define what to load
  feed: scopeFeed("follows"),

  // Optional configurations
  closeOnEose: true,     // Close after getting all events
  onEvent: event => {},  // Handle events as they arrive
  onEose: url => {},     // Handle EOSE from each relay
  onComplete: () => {},  // Called when all relays complete
})

// Load first 20 events
const events = await controller.load(20)

// Load next 20 events
const moreEvents = await controller.load(20)
```

The controller maintains its state between loads, so subsequent calls will:
- Continue from last position
- Use appropriate time windows
- Skip already seen events
- Maintain relay connections

## Paginated Feed

```typescript
import {intersectionFeed, scopeFeed, wotFeed} from '@welshman/feeds'

const HomeFeed = {
  let events = []
  let loading = false
  let controller

  onMount(() => {
    // Create feed for home timeline
    controller = createFeedController({
      feed: intersectionFeed(
        // Content from follows
        scopeFeed("follows"),
        // Filtered by web of trust
        wotFeed({min: 0.1})
      ),

      // Handle events as they arrive
      onEvent: event => {
        events = [...events, event]
      },

      // Track loading state
      onComplete: () => {
        loading = false
      }
    })

    // Initial load
    loadMore()
  })

  const loadMore = async () => {
    if (loading) return
    loading = true

    // Load next batch
    await controller.load(20)
  }
}
```

Key points about `controller.load()`:
- Takes a limit parameter for batch size
- Returns a promise of loaded events
- Can be called repeatedly for pagination
- Handles subscription lifecycle
- Manages relay connections
- Deduplicates events

The controller is stateful and maintains:
- Current time window
- Seen events
- Active subscriptions
- Relay connections

This makes it ideal for implementing infinite scroll feeds, thread loading, and other paginated content scenarios.
