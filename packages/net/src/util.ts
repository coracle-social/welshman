import {omit} from "@welshman/lib"
import type {Filter} from "@welshman/util"

export type Unsubscriber = () => void

/**
 * Rewrites a filter so re-sending it picks up where the subscription left off rather than
 * repeating itself.
 * @param filter - the filter as originally sent
 * @param since - when the socket last heard from the relay
 * @returns a filter covering the gap
 */
export const catchUpFilter = (filter: Filter, since: number): Filter => {
  if (filter.limit === 0) {
    filter = omit(["limit"], filter)
  }

  return {...filter, since}
}
