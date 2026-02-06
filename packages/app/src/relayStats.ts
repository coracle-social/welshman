import {writable, Subscriber} from "svelte/store"
import {getter, makeDeriveItem} from "@welshman/store"
import {groupBy, batch, now, uniq, ago, DAY, HOUR, MINUTE} from "@welshman/lib"
import {isOnionUrl, isLocalUrl, isIPAddress, isRelayUrl, getRelaysFromList} from "@welshman/util"
import {Pool, Socket, SocketStatus, SocketEvent, ClientMessage, RelayMessage} from "@welshman/net"
import {getBlockedRelayList} from "./blockedRelayLists.js"
import {pubkey} from "./session.js"

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

export const relayStatsByUrl = writable(new Map<string, RelayStats>())

export const getRelayStatsByUrl = getter(relayStatsByUrl)

export const getRelayStats = (url: string) => getRelayStatsByUrl().get(url)

export const relayStatsSubscribers: Subscriber<RelayStats>[] = []

export const notifyRelayStats = (relayStats: RelayStats) =>
  relayStatsSubscribers.forEach(sub => sub(relayStats))

export const onRelayStats = (sub: (relayStats: RelayStats) => void) => {
  relayStatsSubscribers.push(sub)

  return () =>
    relayStatsSubscribers.splice(
      relayStatsSubscribers.findIndex(s => s === sub),
      1,
    )
}

export const deriveRelayStats = makeDeriveItem(relayStatsByUrl)

export const getRelayQuality = (url: string) => {
  // Skip non-relays entirely
  if (!isRelayUrl(url)) return 0

  const $pubkey = pubkey.get()

  if ($pubkey && getRelaysFromList(getBlockedRelayList($pubkey)).includes(url)) return 0

  const relayStats = getRelayStats(url)

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

const updateRelayStats = batch(1000, (updates: RelayStatsUpdate[]) => {
  relayStatsByUrl.update($relayStatsByUrl => {
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

    return $relayStatsByUrl
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
