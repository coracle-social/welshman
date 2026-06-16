import type {Unsubscriber} from "svelte/store"
import {on} from "@welshman/lib"
import {WRAP, isDVMKind, isEphemeralKind, verifyEvent} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {SocketEvent, isRelayEvent} from "@welshman/net"
import type {RelayMessage} from "@welshman/net"
import type {IClient} from "./client.js"
import {RelayStats} from "./relayStats.js"
import {GiftWraps} from "./giftWraps.js"

/**
 * A client policy is a side effect applied once per client at construction,
 * returning a cleanup function — directly analogous to a socket policy. Policies
 * own everything that subscribes or links components together (event ingestion,
 * stats collection, gift-wrap unwrapping), so the data classes themselves stay
 * pure and free of subscriptions, and teardown is centralized in `cleanup()`.
 */
export type ClientPolicy = (client: IClient) => Unsubscriber

/**
 * Ingests every event received on any socket into the client's repository. The
 * net layer doesn't do this for us, and it's how all the repository-backed
 * collections (and gift-wrap unwrapping) get populated.
 */
export const clientPolicyIngest: ClientPolicy = client =>
  client.pool.subscribe(socket => {
    const onReceive = (message: RelayMessage) => {
      if (!isRelayEvent(message)) return

      const event = message[2]

      if (isDVMKind(event.kind) || isEphemeralKind(event.kind)) return
      if (!verifyEvent(event)) return

      client.tracker.track(event.id, socket.url)
      client.repository.publish(event)
    }

    socket.on(SocketEvent.Receive, onReceive)

    return () => socket.off(SocketEvent.Receive, onReceive)
  })

/**
 * Wires socket activity on the client's pool into the RelayStats store.
 */
export const clientPolicyRelayStats: ClientPolicy = client => {
  const stats = client.use(RelayStats)

  return client.pool.subscribe(socket => {
    socket.on(SocketEvent.Send, stats.onSocketSend)
    socket.on(SocketEvent.Receive, stats.onSocketReceive)
    socket.on(SocketEvent.Status, stats.onSocketStatus)

    return () => {
      socket.off(SocketEvent.Send, stats.onSocketSend)
      socket.off(SocketEvent.Receive, stats.onSocketReceive)
      socket.off(SocketEvent.Status, stats.onSocketStatus)
    }
  })
}

/**
 * Watches the client's repository for gift wraps (existing and incoming) and
 * feeds them to the unwrap queue.
 */
export const clientPolicyGiftWraps: ClientPolicy = client => {
  const giftWraps = client.use(GiftWraps)

  for (const wrap of client.repository.query([{kinds: [WRAP]}])) {
    giftWraps.enqueue(wrap)
  }

  return on(client.repository, "update", ({added}: {added: TrustedEvent[]}) => {
    for (const event of added) {
      if (event.kind === WRAP) {
        giftWraps.enqueue(event)
      }
    }
  })
}

export const defaultClientPolicies: ClientPolicy[] = [
  clientPolicyIngest,
  clientPolicyRelayStats,
  clientPolicyGiftWraps,
]
