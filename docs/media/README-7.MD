# @welshman/store [![version](https://badgen.net/npm/v/@welshman/store)](https://npmjs.com/package/@welshman/store)

Utilities for dealing with svelte stores when using welshman.

```typescript
import {Repository, NAMED_PEOPLE, NAMED_TOPICS, type TrustedEvent, readUserList, List} from '@welshman/util'
import {deriveEventsMapped} from '@welshman/store'

const repository = new Repository()

// Create a svelte store that performantly maps matching events in the repository to List objects
const lists = deriveEventsMapped<PublishedUserList>(repository, {
  filters: [{kinds: [NAMED_PEOPLE, NAMED_TOPICS]}],
  eventToItem: (event: TrustedEvent) => (event.tags.length > 1 ? readUserList(event) : null),
  itemToEvent: (list: List) => list.event,
})
```
