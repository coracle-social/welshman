import type {Unsubscriber} from "svelte/store"
import {on, noop, always, call} from "@welshman/lib"
import {WRAP, isDVMKind, isEphemeralKind, verifyEvent} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {SocketEvent, isRelayEvent, makeSocketPolicyAuth} from "@welshman/net"
import type {RelayMessage, Socket} from "@welshman/net"
import type {IClient} from "./client.js"
import {RelayStats} from "./relayStats.js"
import {GiftWraps} from "./giftWraps.js"
import {BlockedRelayLists} from "./blockedRelayLists.js"
import {LoggingSigner} from "./logging.js"
import type {LogMessage} from "./logging.js"

/**
 * A client policy is a side effect applied once per client at construction,
 * returning a cleanup function — directly analogous to a socket policy. Policies
 * own everything that subscribes or links components together (event ingestion,
 * stats collection, gift-wrap unwrapping), so the data classes themselves stay
 * pure and free of subscriptions, and teardown is centralized in `cleanup()`.
 */
export type ClientPolicy = (client: IClient) => Unsubscriber

/**
 * Builds a client policy that authenticates the client's sockets (NIP-42) with
 * the user's signer. It appends an auth socket policy to the pool's
 * `socketPolicies`, so every socket the pool creates answers AUTH challenges
 * according to `shouldAuth`; the policy is spliced back out on cleanup. No-op
 * when the client has no user.
 *
 * Use the `clientPolicyAuthAlways` / `clientPolicyAuthNever` presets below, or
 * call this with a custom predicate.
 */
export const makeClientPolicyAuth =
  (shouldAuth: (socket: Socket, client: IClient) => boolean): ClientPolicy =>
  client => {
    if (!client.user) {
      return noop
    }

    const policy = makeSocketPolicyAuth({
      sign: client.user.signer.sign,
      shouldAuth: socket => shouldAuth(socket, client),
    })

    client.pool.socketPolicies.push(policy)

    return () => {
      const index = client.pool.socketPolicies.indexOf(policy)

      if (index !== -1) {
        client.pool.socketPolicies.splice(index, 1)
      }
    }
  }

export const clientPolicyAuthNever = makeClientPolicyAuth(always(false))

export const clientPolicyAuthAlways = makeClientPolicyAuth(always(true))

export const clientPolicyAuthUnlessBlocked = makeClientPolicyAuth((socket, client) => {
  if (!client.user) {
    return false
  }

  return !client
    .use(BlockedRelayLists)
    .getBlockedRelays(client.user.pubkey)
    .includes(socket.url)
})

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

/**
 * Forwards "message" events from the user's signer to `onMessage`. Opt-in —
 * add `clientPolicyLogger(handler)` to a client's `policies`.
 */
export const makeClientPolicyLogger =
  (onMessage: (message: LogMessage) => void): ClientPolicy =>
  client => {
    const unsubscribers: Unsubscriber[] = []
    const signer = client.user?.signer

    if (signer instanceof LoggingSigner) {
      unsubscribers.push(on(signer, "message", onMessage))
    }

    return () => unsubscribers.forEach(call)
  }

export const defaultClientPolicies: ClientPolicy[] = [
  clientPolicyIngest,
  clientPolicyRelayStats,
  clientPolicyGiftWraps,
  clientPolicyAuthUnlessBlocked,
]
