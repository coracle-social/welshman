import type {AnyConfiguredKind} from "./Kind.js"

/**
 * A helper for allowing builders and readers to define domain-specific routing scenarios.
 */
export class EventRouter {
  constructor(readonly def: AnyConfiguredKind) {}
}
