import {ctx, pushToMapKey, inc, flatten, chunk} from '@welshman/lib'
import type {SignedEvent, TrustedEvent, Filter} from '@welshman/util'
import type {NegentropyMessage} from './Executor'
import {subscribe} from './Subscribe'
import {publish} from './Publish'

export type DiffOneOpts = {
  relay: string
  filter: Filter
  events: TrustedEvent[]
}

export const diffOne = ({relay, filter, events}: DiffOneOpts) => {
  const executor = ctx.net.getExecutor([relay])
  const have = new Set<string>()
  const need = new Set<string>()

  return new Promise<NegentropyMessage>((resolve, reject) =>  {
    executor.diff(filter, events, {
      onClose: () => resolve({have: Array.from(have), need: Array.from(need)}),
      onError: (_, message) => reject(message),
      onMessage: (_, message) => {
        for (const id of message.have) {
          have.add(id)
        }

        for (const id of message.need) {
          need.add(id)
        }
      },
    })
  })
}

export type DiffAllOpts = {
  relays: string[]
  filters: Filter[]
  events: TrustedEvent[]
}

export const diffAll = async ({relays, filters, events}: DiffAllOpts) =>
  flatten(
    await Promise.all(
      relays.flatMap(async relay => {
        return await Promise.all(
          filters.map(async filter => {
            return {relay, ...await diffOne({relay, filter, events})}
          })
        )
      })
    )
  )

export type PullOpts = {
  relays: string[]
  filters: Filter[]
  events: TrustedEvent[]
  onEvent?: (event: TrustedEvent) => void
}

export const pull = async ({relays, filters, events, onEvent}: PullOpts) => {
  const countById = new Map<string, number>()
  const idsByRelay = new Map<string, string[]>()

  for (const {relay, need} of await diffAll({relays, filters, events})) {
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
        })
      )
    })
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

  for (const {relay, have} of await diffAll({relays, filters, events})) {
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
    })
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
