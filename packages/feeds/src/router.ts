import {chunks, clamp} from "@welshman/lib"
import {
  WRAP,
  getFilterId,
  outbox,
  userInbox,
  userMessaging,
  searchRelays,
  addMinimalFallbacks,
} from "@welshman/util"
import type {Filter, RelaySelection, RelayScenario} from "@welshman/util"

// The routing capability the feeds engine needs. The app's Router plugin
// implements this — feeds expresses what it wants as the declarative
// RelaySelections from @welshman/util and lets the router resolve them into a
// scored scenario (loading relay lists etc. on demand). This replaces the old
// dependency on @welshman/router's synchronous Router.
export interface FeedRouter {
  resolve(selections: RelaySelection[]): Promise<RelayScenario>
}

export type RelaysAndFilters = {relays: string[]; filters: Filter[]}

type FilterSelections = {filter: Filter; selections: RelaySelection[]}

// One rule per outbox-model source. Each maps a filter to a (possibly narrowed)
// filter plus the selections that should serve it. Ported from @welshman/router's
// getFilterSelectionsFor* — but producing declarative selections, not scenarios.
const rules: ((filter: Filter) => FilterSelections[])[] = [
  // Full-text search goes to the configured search relays.
  filter => (filter.search ? [{filter, selections: [searchRelays(10)]}] : []),
  // Gift wraps (with no explicit authors) go to the user's messaging relays.
  filter =>
    filter.kinds?.includes(WRAP) && !filter.authors
      ? [{filter: {...filter, kinds: [WRAP]}, selections: [userMessaging()]}]
      : [],
  // Authored events go to each author's outbox, chunked to keep filters small.
  filter => {
    if (!filter.authors) return []

    const chunkCount = clamp([1, 30], Math.round(filter.authors.length / 30))

    return chunks(chunkCount, filter.authors).map(authors => ({
      filter: {...filter, authors},
      selections: authors.map(pubkey => outbox(pubkey)),
    }))
  },
  // Everything also gets a low-weight pass over the user's own inbox.
  filter => [{filter, selections: [userInbox(0.2)]}],
]

// Decide which relays to query for which filters under the outbox model. Groups
// selections by narrowed filter, then resolves each group to concrete relays.
export const getFilterSelections = async (
  filters: Filter[],
  router: FeedRouter,
): Promise<RelaysAndFilters[]> => {
  const byId = new Map<string, FilterSelections>()

  for (const filter of filters) {
    for (const rule of rules) {
      for (const {filter: narrowed, selections} of rule(filter)) {
        const id = getFilterId(narrowed)
        const entry = byId.get(id) ?? {filter: narrowed, selections: []}

        entry.selections.push(...selections)
        byId.set(id, entry)
      }
    }
  }

  return Promise.all(
    Array.from(byId.values()).map(async ({filter, selections}) => {
      const scenario = await router.resolve(selections)

      return {filters: [filter], relays: scenario.policy(addMinimalFallbacks).getUrls()}
    }),
  )
}
