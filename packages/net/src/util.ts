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
 * repeating itself. A filter that can match a gift wrap reaches further back, since a wrap
 * published after the subscription dropped carries a timestamp from before it.
 * @param filter - the filter as originally sent
 * @param since - when the socket last heard from the relay
 * @returns a filter covering the gap
 */
export const catchUpFilter = (filter: Filter, since: number): Filter => {
  const matchesWraps = !filter.kinds || filter.kinds.includes(WRAP)

  if (filter.limit === 0) {
    filter = omit(["limit"], filter)
  }

  return {...filter, since: matchesWraps ? since - WRAP_DRIFT : since}
}
