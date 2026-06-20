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
import {Plaintext} from "./plugins/plaintext.js"
import {Logger} from "./plugins/logger.js"

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
 * Wraps user.signer in a WrappedSigner which checks the plaintext cache before
 * attempting to decrypt something.
 */
export const appPolicyCacheDecrypt: AppPolicy = app => {
  if (!app.user) return noop

  return app.user.wrapSigner((method, thunk, args) => {
    if (method === "nip04.decrypt" || method === "nip44.decrypt") {
      const ciphertext = args[1] as string

      return app.use(Plaintext).ensure(ciphertext, thunk as () => Promise<string>) as ReturnType<
        typeof thunk
      >
    }

    return thunk()
  })
}

/**
 * Wraps user.signer in a WrappedSigner which logs sign requests to the app logger.
 */
export const appPolicyLogSignerMethods: AppPolicy = app => {
   if (!app.user) return noop

   const logger = app.use(Logger)

   return app.user.wrapSigner(async (method, thunk) => {
      logger.log("signer", {method, status: "pending"})

      try {
        const result = await thunk()

        logger.log("signer", {method, status: "success"})

        return result
      } catch (error) {
        logger.log("signer", {method, status: "failure", error})

        throw error
      }
    })
}

export const defaultAppPolicies: AppPolicy[] = [
  appPolicyIngest,
  appPolicyRelayStats,
  appPolicyWraps,
  appPolicyCacheDecrypt,
  appPolicyLogSignerMethods,
  appPolicyAuthUnlessBlocked,
]
