# @welshman/feeds

@welshman/feeds is a powerful package for building and executing dynamic Nostr feeds. It provides a declarative way to define complex feed compositions using set operations (union, intersection, difference) and various filtering mechanisms.

## Key Features

- **Declarative Feed Definition**: Define feeds using composable operations
- **Multiple Feed Types**: Support for various feed types including:
  - Basic filters (authors, kinds, tags)
  - Scoped feeds (followers, network)
  - DVM-based feeds
  - Web of Trust (WOT) filtering
  - List-based feeds
  - Label-based filtering
  - Search functionality
- **Set Operations**: Combine feeds using:
  - Union (OR)
  - Intersection (AND)
  - Difference (NOT)
- **Efficient Loading**: Smart event loading with:
  - Time-window based pagination
  - Deduplication
  - Concurrent request handling
- **Extensible**: Easy to integrate with any relay client or DVM implementation
