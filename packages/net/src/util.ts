import {DAY, omit} from "@welshman/lib"
import {WRAP} from "@welshman/util"
import type {Filter} from "@welshman/util"

export type Unsubscriber = () => void

/**
 * How far into the past NIP-59 allows a gift wrap's `created_at` to be moved.
 */
export const WRAP_DRIFT = 2 * DAY

/**
 * Rewrites a filter so re-sending it picks up where the subscription left off rather than
 * repeating itself. A filter asking for gift wraps reaches further back, since a wrap
 * published after the subscription dropped carries a timestamp from before it. Neither reaches
 * back past the filter's own `since`. A limit sizes the subscription's first page, and `since`
 * bounds the gap, so the catch-up drops it.
 * @param filter - the filter as originally sent
 * @param since - when the socket last heard from the relay
 * @returns a filter covering the gap
 */
export const catchUpFilter = (filter: Filter, since: number): Filter => {
  // Only a filter that names wraps is widened: one without kinds would fetch days of everything
  const drift = filter.kinds?.includes(WRAP) ? WRAP_DRIFT : 0

  return {
    ...omit(["limit"], filter),
    since: Math.max(filter.since || 0, since - drift),
  }
}
