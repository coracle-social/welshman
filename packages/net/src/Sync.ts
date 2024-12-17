import {ctx, assoc, lt, groupBy, now, pushToMapKey, inc, flatten, chunk} from "@welshman/lib"
import type {SignedEvent, TrustedEvent, Filter} from "@welshman/util"
import {subscribe} from "./Subscribe.js"
import {publish} from "./Publish.js"

export type DiffOpts = {
  relays: string[]
  filters: Filter[]
  events: TrustedEvent[]
}

export const diff = async ({relays, filters, events}: DiffOpts) => {
  const diffs = flatten(
    await Promise.all(
      relays.flatMap(async relay => {
        return await Promise.all(
          filters.map(async filter => {
            const executor = ctx.net.getExecutor([relay])
            const have = new Set<string>()
            const need = new Set<string>()

            await new Promise<void>((resolve, reject) => {
              executor.diff(filter, events, {
                onClose: resolve,
                onError: (url, message) => reject(message),
                onMessage: (url, message) => {
                  for (const id of message.have) {
                    have.add(id)
                  }

                  for (const id of message.need) {
                    need.add(id)
                  }
                },
              })
            })

            return {relay, have, need}
          }),
        )
      }),
    ),
  )

  return Array.from(groupBy(diff => diff.relay, diffs).entries()).map(([relay, diffs]) => {
    const have = new Set<string>()
    const need = new Set<string>()

    for (const diff of diffs) {
      for (const id of diff.have) {
        have.add(id)
      }

      for (const id of diff.need) {
        need.add(id)
      }
    }

    return {relay, have: Array.from(have), need: Array.from(need)}
  })
}

export type PullOpts = {
  relays: string[]
  filters: Filter[]
  events: TrustedEvent[]
  onEvent?: (event: TrustedEvent) => void
}

export const pull = async ({relays, filters, events, onEvent}: PullOpts) => {
  const countById = new Map<string, number>()
  const idsByRelay = new Map<string, string[]>()

  for (const {relay, need} of await diff({relays, filters, events})) {
    for (const id of need) {
      const count = countById.get(id) || 0

      // Reduce, but don't completely eliminate duplicates, just in case a relay
      // won't give us what we ask for.
      if (count < 2) {
        pushToMapKey(idsByRelay, relay, id)
        countById.set(id, inc(count))
      }
    }
  }

  const result: TrustedEvent[] = []

  await Promise.all(
    Array.from(idsByRelay.entries()).map(([relay, allIds]) => {
      return Promise.all(
        chunk(1024, allIds).map(ids => {
          return new Promise(resolve => {
            subscribe({
              relays: [relay],
              filters: [{ids}],
              closeOnEose: true,
              onClose: resolve,
              onEvent: event => {
                result.push(event)
                onEvent?.(event)
              },
            })
          })
        }),
      )
    }),
  )

  return result
}

export type PushOpts = {
  relays: string[]
  filters: Filter[]
  events: SignedEvent[]
}

export const push = async ({relays, filters, events}: PushOpts) => {
  const relaysById = new Map<string, string[]>()

  for (const {relay, have} of await diff({relays, filters, events})) {
    for (const id of have) {
      pushToMapKey(relaysById, id, relay)
    }
  }

  await Promise.all(
    events.map(async event => {
      const relays = relaysById.get(event.id)

      if (relays) {
        await publish({event, relays}).result
      }
    }),
  )
}

export type SyncOpts = {
  relays: string[]
  filters: Filter[]
  events: SignedEvent[]
}

export const sync = async (opts: SyncOpts) => {
  await pull(opts)
  await push(opts)
}

// Legacy alternatives for use with relays that don't support negentropy

export type PullWithoutNegentropyOpts = {
  relays: string[]
  filters: Filter[]
  onEvent?: (event: TrustedEvent) => void
}

export const pullWithoutNegentropy = async ({
  relays,
  filters,
  onEvent,
}: PullWithoutNegentropyOpts) => {
  let done = false
  let until = now() + 30

  const result: TrustedEvent[] = []

  while (!done) {
    let anyResults = false

    await new Promise<void>(resolve => {
      subscribe({
        relays,
        filters: filters.filter(f => lt(f.since, until)).map(assoc("until", until)),
        closeOnEose: true,
        onComplete: () => {
          done = !anyResults
          resolve()
        },
        onEvent: event => {
          anyResults = true
          until = Math.min(until, event.created_at - 1)
          result.push(event)
          onEvent?.(event)
        },
      })
    })
  }

  return result
}

export type PushWithoutNegentropyOpts = {
  relays: string[]
  events: SignedEvent[]
}

export const pushWithoutNegentropy = ({relays, events}: PushWithoutNegentropyOpts) =>
  Promise.all(
    events.map(async event => {
      await publish({event, relays}).result
    }),
  )

export const syncWithoutNegentropy = async (opts: SyncOpts) => {
  await pullWithoutNegentropy(opts)
  await pushWithoutNegentropy(opts)
}
