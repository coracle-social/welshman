import {writable, derived} from "svelte/store"
import {withGetter} from "@welshman/store"
import {prop, groupBy, indexBy, batch, now, uniq, ago, DAY, HOUR, MINUTE} from "@welshman/lib"
import {isOnionUrl, isLocalUrl, isIPAddress, isRelayUrl} from "@welshman/util"
import {Pool, Socket, SocketStatus, SocketEvent, ClientMessage, RelayMessage} from "@welshman/net"

export type RelayStats = {
  url: string
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
  publish_success_count: number
  publish_failure_count: number
  eose_count: number
  notice_count: number
}

export const makeRelayStats = (url: string): RelayStats => ({
  url,
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
  publish_success_count: 0,
  publish_failure_count: 0,
  eose_count: 0,
  notice_count: 0,
})

export const relayStats = withGetter(writable<RelayStats[]>([]))

export const relayStatsByUrl = withGetter(
  derived(relayStats, $relayStats => indexBy(prop("url"), $relayStats)),
)

export const deriveRelayStats = (url: string) =>
  derived(relayStatsByUrl, $relayStatsByUrl => $relayStatsByUrl.get(url))

export const getRelayQuality = (url: string) => {
  // Skip non-relays entirely
  if (!isRelayUrl(url)) return 0

  const relayStats = relayStatsByUrl.get().get(url)

  // If we have recent errors, skip it
  if (relayStats) {
    if (relayStats.recent_errors.filter(n => n > ago(MINUTE)).length > 0) return 0
    if (relayStats.recent_errors.filter(n => n > ago(HOUR)).length > 3) return 0
    if (relayStats.recent_errors.filter(n => n > ago(DAY)).length > 10) return 0
  }

  // Prefer stuff we're connected to
  if (Pool.get().has(url)) return 1

  // Prefer stuff we've connected to in the past
  if (relayStats) return 0.9

  // If it's not weird url give it an ok score
  if (!isIPAddress(url) && !isLocalUrl(url) && !isOnionUrl(url) && !url.startsWith("ws://")) {
    return 0.8
  }

  // Default to a "meh" score
  return 0.7
}

// Utilities for syncing stats from connections to relays

type RelayStatsUpdate = [string, (stats: RelayStats) => void]

const updateRelayStats = batch(500, (updates: RelayStatsUpdate[]) => {
  relayStats.update($relayStats => {
    const $relayStatsByUrl = indexBy(r => r.url, $relayStats)

    for (const [url, items] of groupBy(([url]) => url, updates)) {
      if (!url || !isRelayUrl(url)) {
        console.warn(`Attempted to update stats for an invalid relay url: ${url}`)
        continue
      }

      const $relayStatsItem: RelayStats = $relayStatsByUrl.get(url) || makeRelayStats(url)

      for (const [_, update] of items) {
        update($relayStatsItem)
      }

      // Copy so the database gets updated, since we're mutating in updates
      $relayStatsByUrl.set(url, {...$relayStatsItem})
    }

    return Array.from($relayStatsByUrl.values())
  })
})

const onSocketSend = ([verb]: ClientMessage, url: string) => {
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

const onSocketReceive = ([verb, ...extra]: RelayMessage, url: string) => {
  if (verb === "OK") {
    const [_, ok] = extra

    updateRelayStats([
      url,
      stats => {
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
    updateRelayStats([
      url,
      stats => {
        stats.eose_count++
      },
    ])
  } else if (verb === "NOTICE") {
    updateRelayStats([
      url,
      stats => {
        stats.notice_count++
      },
    ])
  }
}

const onSocketStatus = (status: string, url: string) => {
  if (status === SocketStatus.Open) {
    updateRelayStats([
      url,
      stats => {
        stats.last_open = now()
        stats.open_count++
      },
    ])
  }

  if (status === SocketStatus.Closed) {
    updateRelayStats([
      url,
      stats => {
        stats.last_close = now()
        stats.close_count++
      },
    ])
  }

  if (status === SocketStatus.Error) {
    updateRelayStats([
      url,
      stats => {
        stats.last_error = now()
        stats.recent_errors = uniq(stats.recent_errors.concat(now())).slice(-10)
      },
    ])
  }
}

export const trackRelayStats = (socket: Socket) => {
  socket.on(SocketEvent.Send, onSocketSend)
  socket.on(SocketEvent.Receive, onSocketReceive)
  socket.on(SocketEvent.Status, onSocketStatus)

  return () => {
    socket.off(SocketEvent.Send, onSocketSend)
    socket.off(SocketEvent.Receive, onSocketReceive)
    socket.off(SocketEvent.Status, onSocketStatus)
  }
}
