# Topics

The topics system provides a reactive way to track and count hashtags across all events in the repository. It automatically updates as new events arrive or are removed.

```typescript
import {topics} from '@welshman/app'

// In a Svelte component
<script>
  // Reactive list of all topics with counts
  $: topicList = $topics
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
</script>

<div class="topics">
  {#each topicList as {name, count}}
    <a href="/t/{name}">
      #{name}
      <span class="count">({count})</span>
    </a>
  {/each}
</div>
```

The store:
- Updates automatically with new events
- Maintains topic counts
- Is throttled to prevent excess updates
- Is case-insensitive
- Integrates with the repository

Think of it as a live tag cloud that stays in sync with your local event cache.

This is commonly used for:
- Tag clouds
- Topic discovery
- Content organization
- Trending topics
