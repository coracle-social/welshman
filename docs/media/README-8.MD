# @welshman/util [![version](https://badgen.net/npm/v/@welshman/util)](https://npmjs.com/package/@welshman/util)

Some nostr-specific utilities. For the most part, these will not have side effects or manage state. Includes:

- Event kind constants
- A nostr address class
- Utilities for working with nostr filters and tags
- Helpers for working with zap events and lightning invoices
- A `Encryptable` for ensuring payloads get encrypted
- An implementation of an in-memory relay, backed by an events repository
- Utilities for building events, validating signatures, and checking event type (replaceable, etc.)
- Types and utilities for NIP 89 handlers
- Types and utilities for NIP 51 lists
- Types and utilities for NIP 01 profile metadata
- Types and utilities for NIP 11 relay profiles
