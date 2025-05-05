import {derived} from "svelte/store"
import {batch, sortBy, call, fromPairs} from "@welshman/lib"
import {
  PROFILE,
  FOLLOWS,
  MUTES,
  RELAYS,
  INBOX_RELAYS,
  getPubkeyTagValues,
  getListTags,
  TrustedEvent,
} from "@welshman/util"
import {throttled, withGetter} from "@welshman/store"
import {Tracker} from "@welshman/net"
import {freshness} from "@welshman/store"
import {Repository, RepositoryUpdate} from "@welshman/relay"
import {getAll, bulkPut, bulkDelete} from "./storage.js"
import {relays} from "./relays.js"
import {handles, onHandle} from "./handles.js"
import {zappers, onZapper} from "./zappers.js"
import {plaintext} from "./plaintext.js"
import {repository, tracker} from "./core.js"
import {sessions} from "./session.js"
import {userFollows} from "./user.js"

export type RelaysStorageAdapterOptions = {
  name: string
}

export class RelaysStorageAdapter {
  keyPath = "url"

  constructor(readonly options: RelaysStorageAdapterOptions) {}

  async init() {
    relays.set(await getAll(this.options.name))
  }

  sync() {
    return throttled(3000, relays).subscribe($relays => bulkPut(this.options.name, $relays))
  }
}

export type HandlesStorageAdapterOptions = {
  name: string
}

export class HandlesStorageAdapter {
  keyPath = "nip05"

  constructor(readonly options: HandlesStorageAdapterOptions) {}

  async init() {
    handles.set(await getAll(this.options.name))
  }

  sync() {
    return onHandle(batch(300, $handles => bulkPut(this.options.name, $handles)))
  }
}

export type ZappersStorageAdapterOptions = {
  name: string
}

export class ZappersStorageAdapter {
  keyPath = "lnurl"

  constructor(readonly options: ZappersStorageAdapterOptions) {}

  async init() {
    zappers.set(await getAll(this.options.name))
  }

  sync() {
    return onZapper(batch(300, $zappers => bulkPut(this.options.name, $zappers)))
  }
}

export type FreshnessStorageAdapterOptions = {
  name: string
}

export class FreshnessStorageAdapter {
  keyPath = "key"

  constructor(readonly options: FreshnessStorageAdapterOptions) {}

  async init() {
    const items = await getAll(this.options.name)

    freshness.set(fromPairs(items.map(item => [item.key, item.value])))
  }

  sync() {
    const interval = setInterval(() => {
      bulkPut(
        this.options.name,
        Object.entries(freshness.get()).map(([key, value]) => ({key, value})),
      )
    }, 10_000)

    return () => clearInterval(interval)
  }
}

export type PlaintextStorageAdapterOptions = {
  name: string
}

export class PlaintextStorageAdapter {
  keyPath = "key"

  constructor(readonly options: PlaintextStorageAdapterOptions) {}

  async init() {
    const items = await getAll(this.options.name)

    plaintext.set(fromPairs(items.map(item => [item.key, item.value])))
  }

  sync() {
    const interval = setInterval(() => {
      bulkPut(
        this.options.name,
        Object.entries(plaintext.get()).map(([key, value]) => ({key, value})),
      )
    }, 10_000)

    return () => clearInterval(interval)
  }
}

export type TrackerStorageAdapterOptions = {
  name: string
  tracker: Tracker
}

export class TrackerStorageAdapter {
  keyPath = "id"

  constructor(readonly options: TrackerStorageAdapterOptions) {}

  async init() {
    const relaysById = new Map<string, Set<string>>()

    for (const {id, relays} of await getAll(this.options.name)) {
      relaysById.set(id, new Set(relays))
    }

    this.options.tracker.load(relaysById)
  }

  sync() {
    const updateOne = (id: string, relay: string) =>
      bulkPut(this.options.name, [{id, relays: Array.from(this.options.tracker.getRelays(id))}])

    const updateAll = () =>
      bulkPut(
        this.options.name,
        Array.from(this.options.tracker.relaysById.entries()).map(([id, relays]) => ({
          id,
          relays: Array.from(relays),
        })),
      )

    this.options.tracker.on("add", updateOne)
    this.options.tracker.on("remove", updateOne)
    this.options.tracker.on("load", updateAll)
    this.options.tracker.on("clear", updateAll)

    return () => {
      this.options.tracker.off("add", updateOne)
      this.options.tracker.off("remove", updateOne)
      this.options.tracker.off("load", updateAll)
      this.options.tracker.off("clear", updateAll)
    }
  }
}

export type EventsStorageAdapterOptions = {
  name: string
  limit: number
  repository: Repository
  rankEvent: (event: TrustedEvent) => number
}

export class EventsStorageAdapter {
  keyPath = "id"
  eventCount = 0

  constructor(readonly options: EventsStorageAdapterOptions) {}

  async init() {
    const events = await getAll(this.options.name)

    this.eventCount = events.length

    this.options.repository.load(events)
  }

  sync() {
    const {name, limit, rankEvent} = this.options

    const onUpdate = async ({added, removed}: RepositoryUpdate) => {
      // Only add events we want to keep
      const keep = added.filter(e => rankEvent(e) > 0)

      // Add new events
      if (keep.length > 0) {
        await bulkPut(name, keep)
      }

      // If we're well above our retention limit, drop lowest-ranked events
      if (this.eventCount > limit * 1.5) {
        removed = new Set(removed)

        for (const event of sortBy(e => -rankEvent(e), await getAll(name)).slice(limit)) {
          removed.add(event.id)
        }
      }

      if (removed.size > 0) {
        await bulkDelete(name, Array.from(removed))
      }

      // Keep track of our total number of events. This isn't strictly accurate, but it's close enough
      this.eventCount = this.eventCount + keep.length - removed.size
    }

    this.options.repository.on("update", onUpdate)

    return () => this.options.repository.off("update", onUpdate)
  }
}

export const defaultStorageAdapters = {
  relays: new RelaysStorageAdapter({name: "relays"}),
  handles: new HandlesStorageAdapter({name: "handles"}),
  zappers: new ZappersStorageAdapter({name: "zappers"}),
  freshness: new FreshnessStorageAdapter({name: "freshness"}),
  plaintext: new PlaintextStorageAdapter({name: "plaintext"}),
  tracker: new TrackerStorageAdapter({name: "tracker", tracker}),
  events: new EventsStorageAdapter(
    call(() => {
      const userFollowPubkeys = withGetter(
        derived(userFollows, l => new Set(getPubkeyTagValues(getListTags(l)))),
      )

      return {
        repository,
        name: "events",
        limit: 10_000,
        rankEvent: (e: TrustedEvent) => {
          const $sessions = sessions.get()
          const metaKinds = [PROFILE, FOLLOWS, MUTES, RELAYS, INBOX_RELAYS]

          if ($sessions[e.pubkey] || e.tags.some(t => $sessions[t[1]])) return 1
          if (metaKinds.includes(e.kind) && userFollowPubkeys.get()?.has(e.pubkey)) return 1

          return 0
        },
      }
    }),
  ),
}
