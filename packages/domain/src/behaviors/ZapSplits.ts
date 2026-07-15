import {sum, allPass, nthEq, nth} from "@welshman/lib"
import type {TrustedEvent} from "@welshman/util"

/**
 * A single recipient of an event's zaps, parsed from a NIP-57 Appendix G `zap`
 * tag of the form `["zap", <pubkey>, <relay hint>, <weight>]`.
 */
export type ZapSplit = {
  pubkey: string
  relay?: string
  weight: number
}

export type ZapSplitAmount = ZapSplit & {amount: number}

const parseWeight = (weight: string | undefined) => {
  const n = weight === undefined ? NaN : parseFloat(weight)

  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Resolve an event's zap-split recipients per NIP-57 Appendix G:
 *
 * - With no `zap` tags the whole zap goes to the event's author.
 * - If no recipient carries a weight, the zap is split equally (weight 1 each).
 * - If weights are only partially present, unweighted recipients drop to weight
 *   0 (i.e. they should not be zapped).
 *
 * Weight-0 recipients are still returned so callers have the full recipient set;
 * they simply receive 0 from `splitZapAmount`.
 *
 * A plain function so it can read splits off any event, regardless of kind,
 * without a kind-specific reader.
 */
export const getZapSplits = (event: TrustedEvent): ZapSplit[] => {
  const zapTags = event.tags.filter(allPass(nthEq(0, "zap"), nth(1)))

  if (zapTags.length === 0) {
    return [{pubkey: event.pubkey, weight: 1}]
  }

  const anyWeighted = zapTags.some(nth(3))

  return zapTags.map(([, pubkey, relay, weight]) => ({
    pubkey,
    relay: relay || undefined,
    weight: anyWeighted ? parseWeight(weight) : 1,
  }))
}

/**
 * Divide `total` (in any integer unit, e.g. millisats) across an event's
 * zap-split recipients proportionally to their weights. Any rounding remainder
 * is handed to the highest-weighted recipient so the parts sum back to exactly
 * `total`. If every weight is 0, nobody is zapped.
 */
export const splitZapAmount = (event: TrustedEvent, total: number): ZapSplitAmount[] => {
  const splits = getZapSplits(event)
  const totalWeight = sum(splits.map(split => split.weight))

  if (totalWeight === 0) {
    return splits.map(split => ({...split, amount: 0}))
  }

  const amounts = splits.map(split => Math.floor((total * split.weight) / totalWeight))

  let maxIndex = 0
  splits.forEach((split, i) => {
    if (split.weight > splits[maxIndex].weight) {
      maxIndex = i
    }
  })

  amounts[maxIndex] += total - sum(amounts)

  return splits.map((split, i) => ({...split, amount: amounts[i]}))
}
