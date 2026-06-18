import {groupBy, batch, now, uniq, ago, DAY, HOUR, MINUTE} from "@welshman/lib"
import {isOnionUrl, isLocalUrl, isIPAddress, isRelayUrl} from "@welshman/util"
import {SocketStatus, SocketEvent} from "@welshman/net"
import type {ClientMessage, RelayMessage, Socket} from "@welshman/net"
import {MapPlugin} from "./base.js"
import {BlockedRelayLists} from "./blockedRelayLists.js"

export type RelayStatsUpdate = [string, (stats: RelayStatsItem) => void]

export type RelayStatsItem = {
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

export const makeRelayStatsItem = (url: string): RelayStatsItem => ({
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

/**
 * Per-relay connection statistics, keyed by url, plus the `getQuality` heuristic
 * the router uses to rank relays. A pure store — the socket wiring that fills it
 * lives in `clientPolicyRelayStats`.
 */
export class RelayStats extends MapPlugin<RelayStatsItem> {
  getQuality = (url: string) => {
    // Skip non-relays entirely
    if (!isRelayUrl(url)) return 0

    // Skip relays the user has blocked
    const pubkey = this.ctx.user?.pubkey

    if (pubkey && this.ctx.use(BlockedRelayLists).getBlockedRelays(pubkey).includes(url)) {
      return 0
    }

    const stats = this.get(url)

    // If we have recent errors, skip it
    if (stats) {
      if (stats.recent_errors.filter(n => n > ago(MINUTE)).length > 0) return 0
      if (stats.recent_errors.filter(n => n > ago(HOUR)).length > 3) return 0
      if (stats.recent_errors.filter(n => n > ago(DAY)).length > 10) return 0
    }

    // Prefer stuff we're connected to
    if (this.ctx.pool.has(url)) return 1

    // Prefer stuff we've connected to in the past
    if (stats) return 0.9

    // If it's not a weird url give it an ok score
    if (!isIPAddress(url) && !isLocalUrl(url) && !isOnionUrl(url) && !url.startsWith("ws://")) {
      return 0.8
    }

    // Default to a "meh" score
    return 0.7
  }

  private update = batch(150, (batched: RelayStatsUpdate[]) => {
    for (const [url, updates] of groupBy(([url]) => url, batched)) {
      if (!url || !isRelayUrl(url)) {
        console.warn(`Attempted to update stats for an invalid relay url: ${url}`)
        continue
      }

      const prev = this.get(url)
      const next = prev ? {...prev} : makeRelayStatsItem(url)

      for (const [, update] of updates) {
        update(next)
      }

      this.set(url, next)
    }
  })

  private onSocketSend = ([verb]: ClientMessage, url: string) => {
    if (verb === "REQ") {
      this.update([
        url,
        stats => {
          stats.request_count++
          stats.last_request = now()
        },
      ])
    } else if (verb === "EVENT") {
      this.update([
        url,
        stats => {
          stats.publish_count++
          stats.last_publish = now()
        },
      ])
    }
  }

  private onSocketReceive = ([verb, ...extra]: RelayMessage, url: string) => {
    if (verb === "OK") {
      const [, ok] = extra

      this.update([
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
      this.update([url, stats => (stats.last_auth = now())])
    } else if (verb === "EVENT") {
      this.update([
        url,
        stats => {
          stats.event_count++
          stats.last_event = now()
        },
      ])
    } else if (verb === "EOSE") {
      this.update([url, stats => stats.eose_count++])
    } else if (verb === "NOTICE") {
      this.update([url, stats => stats.notice_count++])
    }
  }

  private onSocketStatus = (status: string, url: string) => {
    if (status === SocketStatus.Open) {
      this.update([
        url,
        stats => {
          stats.last_open = now()
          stats.open_count++
        },
      ])
    }

    if (status === SocketStatus.Closed) {
      this.update([
        url,
        stats => {
          stats.last_close = now()
          stats.close_count++
        },
      ])
    }

    if (status === SocketStatus.Error) {
      this.update([
        url,
        stats => {
          stats.last_error = now()
          stats.recent_errors = uniq(stats.recent_errors.concat(now())).slice(-10)
        },
      ])
    }
  }

  monitorSocket = (socket: Socket) => {
    socket.on(SocketEvent.Send, this.onSocketSend)
    socket.on(SocketEvent.Receive, this.onSocketReceive)
    socket.on(SocketEvent.Status, this.onSocketStatus)

    return () => {
      socket.off(SocketEvent.Send, this.onSocketSend)
      socket.off(SocketEvent.Receive, this.onSocketReceive)
      socket.off(SocketEvent.Status, this.onSocketStatus)
    }
  }
}
