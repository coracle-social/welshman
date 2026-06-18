import type {Unsubscriber} from "svelte/store"
import {on, noop, always, call} from "@welshman/lib"
import {WRAP, isDVMKind, isEphemeralKind, verifyEvent} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {SocketEvent, isRelayEvent, makeSocketPolicyAuth} from "@welshman/net"
import type {RelayMessage, Socket} from "@welshman/net"
import type {IApp} from "./app.js"
import {RelayStats} from "./plugins/relayStats.js"
import {Wraps} from "./plugins/wraps.js"
import {BlockedRelayLists} from "./plugins/blockedRelayLists.js"
import {LoggingSigner} from "./logging.js"
import type {LogMessage} from "./logging.js"

/**
 * An app policy is a side effect applied once per app at construction,
 * returning a cleanup function — directly analogous to a socket policy. Policies
 * own everything that subscribes or links components together (event ingestion,
 * stats collection, gift-wrap unwrapping), so the data classes themselves stay
 * pure and free of subscriptions, and teardown is centralized in `cleanup()`.
 */
export type AppPolicy = (app: IApp) => Unsubscriber

/**
 * Builds an app policy that authenticates the app's sockets (NIP-42) with
 * the user's signer. It appends an auth socket policy to the pool's
 * `socketPolicies`, so every socket the pool creates answers AUTH challenges
 * according to `shouldAuth`; the policy is spliced back out on cleanup. No-op
 * when the app has no user.
 *
 * Use the `appPolicyAuthAlways` / `appPolicyAuthNever` presets below, or
 * call this with a custom predicate.
 */
export const makeAppPolicyAuth =
  (shouldAuth: (socket: Socket, app: IApp) => boolean): AppPolicy =>
  app => {
    if (!app.user) {
      return noop
    }

    const policy = makeSocketPolicyAuth({
      sign: app.user.signer.sign,
      shouldAuth: socket => shouldAuth(socket, app),
    })

    app.pool.socketPolicies.push(policy)

    return () => {
      const index = app.pool.socketPolicies.indexOf(policy)

      if (index !== -1) {
        app.pool.socketPolicies.splice(index, 1)
      }
    }
  }

export const appPolicyAuthNever = makeAppPolicyAuth(always(false))

export const appPolicyAuthAlways = makeAppPolicyAuth(always(true))

export const appPolicyAuthUnlessBlocked = makeAppPolicyAuth((socket, app) => {
  if (!app.user) {
    return false
  }

  return !app
    .use(BlockedRelayLists)
    .urls(app.user.pubkey)
    .get()
    .includes(socket.url)
})

/**
 * Ingests every event received on any socket into the app's repository. The
 * net layer doesn't do this for us, and it's how all the repository-backed
 * collections (and gift-wrap unwrapping) get populated.
 */
export const appPolicyIngest: AppPolicy = app =>
  app.pool.subscribe(socket => {
    const onReceive = (message: RelayMessage) => {
      if (!isRelayEvent(message)) return

      const event = message[2]

      if (isDVMKind(event.kind) || isEphemeralKind(event.kind)) return
      if (!verifyEvent(event)) return

      app.tracker.track(event.id, socket.url)
      app.repository.publish(event)
    }

    socket.on(SocketEvent.Receive, onReceive)

    return () => socket.off(SocketEvent.Receive, onReceive)
  })

/**
 * Listens to socket activity on the app's pool into the RelayStats store.
 */
export const appPolicyRelayStats: AppPolicy = app => {
  return app.pool.subscribe(app.use(RelayStats).monitorSocket)
}

/**
 * Watches the app's repository for gift wraps (existing and incoming) and
 * feeds them to the unwrap queue.
 */
export const appPolicyWraps: AppPolicy = app => {
  const wraps = app.use(Wraps)

  for (const wrap of app.repository.query([{kinds: [WRAP]}])) {
    wraps.enqueue(wrap)
  }

  return on(app.repository, "update", ({added}: {added: TrustedEvent[]}) => {
    for (const event of added) {
      if (event.kind === WRAP) {
        wraps.enqueue(event)
      }
    }
  })
}

/**
 * Forwards "message" events from the user's signer to `onMessage`. Opt-in —
 * add `makeAppPolicyLogger(handler)` to an app's `policies`.
 */
export const makeAppPolicyLogger =
  (onMessage: (message: LogMessage) => void): AppPolicy =>
  app => {
    const unsubscribers: Unsubscriber[] = []
    const signer = app.user?.signer

    if (signer instanceof LoggingSigner) {
      unsubscribers.push(on(signer, "message", onMessage))
    }

    return () => unsubscribers.forEach(call)
  }

export const defaultAppPolicies: AppPolicy[] = [
  appPolicyIngest,
  appPolicyRelayStats,
  appPolicyWraps,
  appPolicyAuthUnlessBlocked,
]
