import {writable, Subscriber} from "svelte/store"
import {getter, makeDeriveItem} from "@welshman/store"
import {groupBy, batch, now, uniq, ago, DAY, HOUR, MINUTE} from "@welshman/lib"
import {isOnionUrl, isLocalUrl, isIPAddress, isRelayUrl, getRelaysFromList} from "@welshman/util"
import {Socket, SocketStatus, SocketEvent, ClientMessage, RelayMessage} from "@welshman/net"
import {getBlockedRelayList} from "./blockedRelayLists.js"
import type {Client} from "./client.js"


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

export class RelayStats extends ClientData<RelayStatsItem> {
  cleanup: Unsubscriber

  constructor(readonly client: Client) {
    this.cleanup = client.pool.subscribe(socket => {
      socket.on(SocketEvent.Send, this.onSocketSend)
      socket.on(SocketEvent.Receive, this.onSocketReceive)
      socket.on(SocketEvent.Status, this.onSocketStatus)

      return () => {
        socket.off(SocketEvent.Send, this.onSocketSend)
        socket.off(SocketEvent.Receive, this.onSocketReceive)
        socket.off(SocketEvent.Status, this.onSocketStatus)
      }
    })
  }

  // Utilities for syncing stats from connections to relays

  private updateRelayStats = batch(150, (batched: RelayStatsUpdate[]) => {
    for (const [url, updates] of groupBy(([url]) => url, batched)) {
      const prev = this.get(url)
      const next = prev ? {...prev} : makeRelayStatsItem(url)

      for (const [_, update] of updates) {
        update(next)
      }

      this.set(url, next)
    }
  })

  private onSocketSend = ([verb]: ClientMessage, url: string) => {
    if (verb === "REQ") {
      this.updateRelayStats([
        url,
        stats => {
          stats.request_count++
          stats.last_request = now()
        },
      ])
    } else if (verb === "EVENT") {
      this.updateRelayStats([
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
      const [_, ok] = extra

      this.updateRelayStats([
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
      this.updateRelayStats([
        url,
        stats => {
          stats.last_auth = now()
        },
      ])
    } else if (verb === "EVENT") {
      this.updateRelayStats([
        url,
        stats => {
          stats.event_count++
          stats.last_event = now()
        },
      ])
    } else if (verb === "EOSE") {
      this.updateRelayStats([
        url,
        stats => {
          stats.eose_count++
        },
      ])
    } else if (verb === "NOTICE") {
      this.updateRelayStats([
        url,
        stats => {
          stats.notice_count++
        },
      ])
    }
  }

  private onSocketStatus = (status: string, url: string) => {
    if (status === SocketStatus.Open) {
      this.updateRelayStats([
        url,
        stats => {
          stats.last_open = now()
          stats.open_count++
        },
      ])
    }

    if (status === SocketStatus.Closed) {
      this.updateRelayStats([
        url,
        stats => {
          stats.last_close = now()
          stats.close_count++
        },
      ])
    }

    if (status === SocketStatus.Error) {
      this.updateRelayStats([
        url,
        stats => {
          stats.last_error = now()
          stats.recent_errors = uniq(stats.recent_errors.concat(now())).slice(-10)
        },
      ])
    }
  }
}
