import {EventEmitter} from "events"
import {on, sleep, randomId, groupBy, pushToMapKey, inc, flatten, chunk} from "@welshman/lib"
import {SignedEvent, Filter} from "@welshman/util"
import {
  RelayMessage,
  isRelayNegErr,
  isRelayNegMsg,
  RelayMessageType,
  ClientMessageType,
} from "./message.js"
import {getAdapter, AdapterContext, AbstractAdapter, AdapterEvent} from "./adapter.js"
import {Negentropy, NegentropyStorageVector} from "./negentropy.js"
import {requestOne} from "./request.js"
import {publish} from "./publish.js"

export enum DifferenceEvent {
  Message = "difference:event:message",
  Error = "difference:event:error",
  Close = "difference:event:close",
}

export type DifferenceEvents = {
  [DifferenceEvent.Message]: (payload: {have: string[]; need: string[]}, url: string) => void
  [DifferenceEvent.Error]: (error: string, url: string) => void
  [DifferenceEvent.Close]: () => void
}

export type DifferenceOptions = {
  relay: string
  filter: Filter
  events: SignedEvent[]
  context?: AdapterContext
}

export class Difference extends EventEmitter {
  have = new Set<string>()
  need = new Set<string>()

  _id = `NEG-${randomId().slice(0, 8)}`
  _unsubscriber: () => void
  _adapter: AbstractAdapter
  _closed = false

  constructor(readonly options: DifferenceOptions) {
    super()

    // Set up our adapter
    this._adapter = getAdapter(this.options.relay, this.options.context)

    // Set up negentropy
    const storage = new NegentropyStorageVector()
    const neg = new Negentropy(storage, 50_000)

    for (const event of this.options.events) {
      storage.insert(event.created_at, event.id)
    }

    storage.seal()

    // Add listeners
    this._unsubscriber = on(
      this._adapter,
      AdapterEvent.Receive,
      async (message: RelayMessage, url: string) => {
        if (isRelayNegMsg(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            const [newMsg, have, need] = await neg.reconcile(msg)

            for (const id of have) {
              this.have.add(id)
            }

            for (const id of need) {
              this.need.add(id)
            }

            this.emit(DifferenceEvent.Message, {have, need}, url)

            if (newMsg) {
              this._adapter.send([RelayMessageType.NegMsg, this._id, newMsg])
            }
          }
        }

        if (isRelayNegErr(message)) {
          const [_, negid, msg] = message

          if (negid === this._id) {
            this.emit(DifferenceEvent.Error, msg, url)
          }
        }
      },
    )

    neg.initiate().then((msg: string) => {
      this._adapter.send([ClientMessageType.NegOpen, this._id, this.options.filter, msg])
    })
  }

  close() {
    if (this._closed) return

    this._adapter.send([ClientMessageType.NegClose, this._id])
    this.emit(DifferenceEvent.Close)
    this.removeAllListeners()
    this._adapter.cleanup()
    this._unsubscriber()
    this._closed = true
  }
}

// diff is a shortcut for diffing multiple filters across multiple relays

export type DiffOptions = {
  relays: string[]
  filters: Filter[]
  events: SignedEvent[]
  context?: AdapterContext
}

export type DiffItem = {
  relay: string
  have: Set<string>
  need: Set<string>
}

export const diff = async ({relays, filters, ...options}: DiffOptions) => {
  const diffs = flatten(
    await Promise.all(
      relays.flatMap(async relay => {
        return await Promise.all(
          filters.map(
            async filter =>
              new Promise<DiffItem>((resolve, reject) => {
                const diff = new Difference({relay, filter, ...options})

                diff.on(DifferenceEvent.Close, () => {
                  resolve({relay, have: diff.have, need: diff.need})
                })

                diff.on(DifferenceEvent.Error, (url, message) => {
                  reject(message)
                  diff.close()
                })

                sleep(30_000).then(() => {
                  reject("timeout")
                  diff.close()
                })
              }),
          ),
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

// Pull diffs multiple arrays and fetches missing events

export type PullOptions = DiffOptions

export const pull = async ({context, ...options}: PullOptions) => {
  const countById = new Map<string, number>()
  const idsByRelay = new Map<string, string[]>()

  for (const {relay, need} of await diff({context, ...options})) {
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

  const result: SignedEvent[] = []

  await Promise.all(
    Array.from(idsByRelay.entries()).map(([relay, allIds]) => {
      return Promise.all(
        chunk(500, allIds).map(ids =>
          new Promise<void>(resolve =>
            requestOne({
              relay,
              context,
              filters: [{ids}],
              autoClose: true,
              onClose: resolve,
              onEvent: event => result.push(event as SignedEvent),
            })
          )
        ),
      )
    }),
  )

  return result
}

// Push diffs multiple relays and publishes missing events

export type PushOptions = DiffOptions

export const push = async ({context, events, ...options}: PushOptions) => {
  const relaysById = new Map<string, string[]>()

  for (const {relay, have} of await diff({context, events, ...options})) {
    for (const id of have) {
      pushToMapKey(relaysById, id, relay)
    }
  }

  await Promise.all(
    events.map(async event => {
      const relays = relaysById.get(event.id)

      if (relays) {
        await publish({event, relays, context})
      }
    }),
  )
}
