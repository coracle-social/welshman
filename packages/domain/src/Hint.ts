import type {RelaySelection} from "@welshman/util"

// A deferred relay hint embedded in a tag. It's a thin wrapper around relay
// selections (the @welshman/util DSL) so it duck-types apart from the plain
// strings in a tag: `EventBuilder.finalize` walks the tags and dereferences each
// `Hint` to a single url once a resolver is available. Building stays synchronous
// — resolution happens at finalize, so the router/app isn't needed while building.
export class Hint {
  constructor(readonly selections: RelaySelection[]) {}
}

export const hint = (...selections: RelaySelection[]) => new Hint(selections)

// A tag under construction: plain strings, with a `Hint` allowed at relay-hint
// positions. Finalizing an event resolves every `Hint` to a url string.
export type Tag = (string | Hint)[]
