import {writable, derived} from "svelte/store"
import {withGetter} from "@welshman/store"
import {ctx, groupBy, indexBy, batch, now, ago, uniq, batcher, postJson} from "@welshman/lib"
import type {RelayProfile} from "@welshman/util"
import {normalizeRelayUrl, displayRelayUrl, displayRelayProfile} from "@welshman/util"
import {ConnectionEvent} from "@welshman/net"
import type {Connection, Message} from "@welshman/net"
import {collection} from "./collection.js"

export type RelayStats = {
  first_seen: number
  recent_errors: number[]
  open_count: number
  close_count: number
  publish_count: number
  request_count: number
  event_count: number
  last_open: number
  last_close: number
  last_error: number
  last_publish: number
  last_request: number
  last_event: number
  last_auth: number
  publish_timer: number
  publish_success_count: number
  publish_failure_count: number
  eose_count: number
  eose_timer: number
  notice_count: number
}

export const makeRelayStats = (): RelayStats => ({
  first_seen: now(),
  recent_errors: [],
  open_count: 0,
  close_count: 0,
  publish_count: 0,
  request_count: 0,
  event_count: 0,
  last_open: 0,
  last_close: 0,
  last_error: 0,
  last_publish: 0,
  last_request: 0,
  last_event: 0,
  last_auth: 0,
  publish_timer: 0,
  publish_success_count: 0,
  publish_failure_count: 0,
  eose_count: 0,
  eose_timer: 0,
  notice_count: 0,
})

export type Relay = {
  url: string
  stats?: RelayStats
  profile?: RelayProfile
}

export const relays = withGetter(writable<Relay[]>([]))

export const relaysByPubkey = derived(relays, $relays =>
  groupBy(
    $relay => $relay.profile?.pubkey,
    $relays.filter($relay => $relay.profile?.pubkey),
  ),
)

export const fetchRelayProfiles = async (urls: string[]) => {
  const base = ctx.app.dufflepudUrl!

  if (!base) {
    throw new Error("ctx.app.dufflepudUrl is required to fetch relay metadata")
  }

  const res: any = await postJson(`${base}/relay/info`, {urls})
  const profilesByUrl = new Map<string, RelayProfile>()

  for (const {url, info} of res?.data || []) {
    profilesByUrl.set(url, info)
  }

  return profilesByUrl
}

export const {
  indexStore: relaysByUrl,
  deriveItem: deriveRelay,
  loadItem: loadRelay,
} = collection({
  name: "relays",
  store: relays,
  getKey: (relay: Relay) => relay.url,
  load: batcher(800, async (rawUrls: string[]) => {
    const urls = rawUrls.map(normalizeRelayUrl)
    const fresh = await fetchRelayProfiles(uniq(urls))
    const stale = relaysByUrl.get()

    for (const url of urls) {
      const relay = stale.get(url)
      const profile = fresh.get(url)

      if (profile) {
        stale.set(url, {...relay, profile, url})
      }
    }

    relays.set(Array.from(stale.values()))

    return urls
  }),
})

export const displayRelayByPubkey = (url: string) =>
  displayRelayProfile(relaysByUrl.get().get(url)?.profile, displayRelayUrl(url))

export const deriveRelayDisplay = (url: string) =>
  derived(deriveRelay(url), $relay => displayRelayProfile($relay?.profile, displayRelayUrl(url)))

// Utilities for syncing stats from connections to relays

type RelayStatsUpdate = [string, (stats: RelayStats) => void]

const updateRelayStats = batch(500, (updates: RelayStatsUpdate[]) => {
  relays.update($relays => {
    const $relaysByUrl = indexBy(r => r.url, $relays)
    const $itemsByUrl = groupBy(([url]) => url, updates)

    for (const [url, items] of $itemsByUrl.entries()) {
      const $relay: Relay = $relaysByUrl.get(url) || {url}

      if (!$relay.stats) {
        $relay.stats = makeRelayStats()
      } else if ($relay.stats.notice_count === undefined) {
        // Migrate from old stats
        $relay.stats = {...makeRelayStats(), ...$relay.stats}
      }

      for (const [_, update] of items) {
        update($relay.stats)
      }

      // Copy so the database gets updated, since we're mutating in updates
      $relaysByUrl.set(url, {...$relay})
    }

    return Array.from($relaysByUrl.values())
  })
})

const onConnectionOpen = ({url}: Connection) =>
  updateRelayStats([
    url,
    stats => {
      stats.last_open = now()
      stats.open_count++
    },
  ])

const onConnectionClose = ({url}: Connection) =>
  updateRelayStats([
    url,
    stats => {
      stats.last_close = now()
      stats.close_count++
    },
  ])

const onConnectionSend = ({url}: Connection, [verb]: Message) => {
  if (verb === "REQ") {
    updateRelayStats([
      url,
      stats => {
        stats.request_count++
        stats.last_request = now()
      },
    ])
  } else if (verb === "EVENT") {
    updateRelayStats([
      url,
      stats => {
        stats.publish_count++
        stats.last_publish = now()
      },
    ])
  }
}

const onConnectionReceive = ({url, state}: Connection, [verb, ...extra]: Message) => {
  if (verb === "OK") {
    const [eventId, ok] = extra
    const pub = state.pendingPublishes.get(eventId)

    updateRelayStats([
      url,
      stats => {
        if (pub) {
          stats.publish_timer += ago(pub.sent)
        }

        if (ok) {
          stats.publish_success_count++
        } else {
          stats.publish_failure_count++
        }
      },
    ])
  } else if (verb === "AUTH") {
    updateRelayStats([
      url,
      stats => {
        stats.last_auth = now()
      },
    ])
  } else if (verb === "EVENT") {
    updateRelayStats([
      url,
      stats => {
        stats.event_count++
        stats.last_event = now()
      },
    ])
  } else if (verb === "EOSE") {
    const request = state.pendingRequests.get(extra[0])

    // Only count the first eose
    if (request && !request.eose) {
      updateRelayStats([
        url,
        stats => {
          stats.eose_count++
          stats.eose_timer += now() - request.sent
        },
      ])
    }
  } else if (verb === "NOTICE") {
    updateRelayStats([
      url,
      stats => {
        stats.notice_count++
      },
    ])
  }
}

const onConnectionError = ({url}: Connection) =>
  updateRelayStats([
    url,
    stats => {
      stats.last_error = now()
      stats.recent_errors = uniq(stats.recent_errors.concat(now())).slice(-10)
    },
  ])

export const trackRelayStats = (connection: Connection) => {
  connection.on(ConnectionEvent.Open, onConnectionOpen)
  connection.on(ConnectionEvent.Close, onConnectionClose)
  connection.on(ConnectionEvent.Send, onConnectionSend)
  connection.on(ConnectionEvent.Receive, onConnectionReceive)
  connection.on(ConnectionEvent.Error, onConnectionError)

  return () => {
    connection.off(ConnectionEvent.Open, onConnectionOpen)
    connection.off(ConnectionEvent.Close, onConnectionClose)
    connection.off(ConnectionEvent.Send, onConnectionSend)
    connection.off(ConnectionEvent.Receive, onConnectionReceive)
    connection.off(ConnectionEvent.Error, onConnectionError)
  }
}
