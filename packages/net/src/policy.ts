import {on, ms, nthNe, always, call, randomId, sleep, ago, now} from "@welshman/lib"
import {RELAY_JOIN, StampedEvent, SignedEvent, Filter, neverFilter} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  isClientReq,
  isClientNegOpen,
  isClientNegClose,
  ClientMessageType,
  RelayMessage,
  isRelayOk,
  isRelayEose,
  isRelayClosed,
  isRelayNegErr,
  matchReason,
} from "./message.js"
import {Socket, SocketStatus, SocketEvent, SocketPolicy} from "./socket.js"
import {AuthStatus, AuthStateEvent} from "./auth.js"
import {catchUpFilter} from "./util.js"

/**
 * Handles auth-related message management:
 * - Defers sending messages when a challenge is pending
 * - Re-enqueues event/req messages once if rejected due to auth-required
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyAuthBuffer = (socket: Socket) => {
  const {None, Ok, DeniedSignature, Forbidden} = AuthStatus
  const terminalStatuses = [Ok, DeniedSignature, Forbidden]

  let buffer: ClientMessage[] = []

  const unsubscribers = [
    on(socket, SocketEvent.Sending, (message: ClientMessage) => {
      // Always allow sending auth
      if (isClientAuth(message)) return

      // Always allow sending join requests
      if (isClientEvent(message) && message[1].kind === RELAY_JOIN) return

      // If the auth flow is complete, no need to buffer anymore
      if (terminalStatuses.includes(socket.auth.status)) return

      // If the client is closing a req, remove both from our buffer
      // Otherwise, if auth isn't done, hang on to recent messages in case we need to replay them
      if (isClientClose(message) || isClientNegClose(message)) {
        buffer = buffer.filter(nthNe(1, message[1]))
      } else {
        buffer = buffer.slice(-50).concat([message])
      }
    }),
    on(socket, SocketEvent.Receiving, (message: RelayMessage) => {
      // If the relay is closing a request during auth, don't tell the caller, we'll retry it
      if (
        (isRelayClosed(message) || isRelayNegErr(message)) &&
        matchReason(message[2], "auth-required")
      ) {
        socket._recvQueue.remove(message)
      }

      // If we get an eose but we're in the middle of authenticating, wait
      if (isRelayEose(message) && ![None, Ok].includes(socket.auth.status)) {
        socket._recvQueue.remove(message)
      }

      // If the client is rejecting an event during auth, don't tell the caller, we'll retry it
      if (isRelayOk(message) && !message[2] && matchReason(message[3], "auth-required")) {
        socket._recvQueue.remove(message)
      }
    }),
    on(socket.auth, AuthStateEvent.Status, (status: AuthStatus) => {
      // Send buffered messages when we get successful auth. In any case, clear them out
      // if the auth flow is complete
      if (status === Ok) {
        for (const message of buffer.splice(0)) {
          socket.send(message)
        }
      } else if (terminalStatuses.includes(socket.auth.status)) {
        buffer = []
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
}

/**
 * Auto-connects a closed socket when a message is sent unless there was a recent error
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyConnectOnSend = (socket: Socket) => {
  let lastError = 0

  const unsubscribers = [
    on(socket, SocketEvent.Status, (newStatus: SocketStatus) => {
      // Keep track of the most recent error
      if (newStatus === SocketStatus.Error) {
        lastError = now()
      }
    }),
    on(socket, SocketEvent.Sending, (message: ClientMessage) => {
      const isClosed = [SocketStatus.Closed, SocketStatus.Error].includes(socket.status)

      // When a new message is sent, make sure the socket is open (unless there was a recent error)
      if (isClosed && lastError < ago(5)) {
        socket.open()
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
}

// How long a socket carrying work sits quiet before we check the relay is still there
const PROBE_IDLE = 30

// How long a socket has to answer after probing
const PROBE_TIMEOUT = 10

/**
 * Owns a socket's lifecycle: closes it once nothing needs it, checks the relay is still there
 * when something does, reopens it, and catches up on what it missed.
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyLifecycle = (socket: Socket) => {
  const pending = new Map<string, ClientMessage>()

  let lastOpen = now()
  let lastActivity = now()
  let lastReceive = now()
  let probeId: string | undefined
  let probedAt = 0

  const unsubscribers = [
    on(socket, SocketEvent.Status, (newStatus: SocketStatus) => {
      const isClosed = [SocketStatus.Closed, SocketStatus.Error].includes(newStatus)

      // Keep track of the most recent open
      if (newStatus === SocketStatus.Open) {
        lastOpen = now()
      }

      // A probe belongs to the connection that was carrying it, not to the next one
      if (isClosed && probeId) {
        pending.delete(probeId)
        probeId = undefined
      }

      // If the socket closed and we have no error, reopen it but don't flap
      if (isClosed && pending.size) {
        const since = lastReceive
        const delay = Math.max(0, ms(5 - (now() - lastOpen)))

        sleep(delay).then(() => {
          socket.attemptToOpen()

          for (const message of pending.values()) {
            if (isClientReq(message)) {
              const filters = (message.slice(2) as Filter[]).map(filter =>
                catchUpFilter(filter, since),
              )

              socket.send([...message.slice(0, 2), ...filters])
            } else {
              socket.send(message)
            }
          }
        })
      }
    }),
    on(socket, SocketEvent.Send, (message: ClientMessage) => {
      lastActivity = now()

      if (isClientEvent(message)) {
        pending.set(message[1].id, message)
      }

      if (isClientReq(message) || isClientNegOpen(message)) {
        pending.set(message[1], message)
      }

      if (isClientClose(message) || isClientNegClose(message)) {
        pending.delete(message[1])
      }
    }),
    on(socket, SocketEvent.Receive, (message: RelayMessage) => {
      lastActivity = now()
      lastReceive = now()

      // Any traffic at all proves the relay is there, so retire the probe
      if (probeId) {
        socket.send([ClientMessageType.Close, probeId])
        probeId = undefined
      }

      if (isRelayClosed(message) || isRelayOk(message)) {
        pending.delete(message[1])
      }
    }),
  ]

  const interval = setInterval(() => {
    if (socket.status !== SocketStatus.Open) return

    // Nothing is waiting on this socket, so let it go
    if (pending.size === 0) {
      if (lastActivity < ago(30)) {
        socket.close()
      }

      return
    }

    // Something is waiting, but a device coming back from a suspend can find a socket that only
    // looks open: the relay went away without a close ever firing, so nothing reconnects and
    // every subscription on it is quietly dead. Send a probe request and close if no response.
    if (probeId) {
      if (probedAt < ago(PROBE_TIMEOUT)) {
        socket.close()
      }
    } else if (lastReceive < ago(PROBE_IDLE)) {
      probeId = `PING-${randomId()}`
      probedAt = now()

      socket.send([ClientMessageType.Req, probeId, neverFilter])
    }
  }, 3000)

  return () => {
    unsubscribers.forEach(call)
    clearInterval(interval)
  }
}

export type SocketPolicyAuthOptions = {
  sign: (event: StampedEvent) => Promise<SignedEvent>
  shouldAuth?: (socket: Socket) => boolean
}

/**
 * Factory function for a policy which may authenticate the socket
 * @param options - SocketPolicyAuthOptions object
 * @return a socket policy
 */
export const makeSocketPolicyAuth = (options: SocketPolicyAuthOptions) => (socket: Socket) => {
  const shouldAuth = options.shouldAuth || always(true)

  const unsubscribers = [
    on(socket.auth, AuthStateEvent.Status, (status: AuthStatus) => {
      if (status === AuthStatus.Requested && shouldAuth(socket)) {
        socket.auth.doAuth(options.sign)
      }
    }),
  ]

  return () => {
    unsubscribers.forEach(call)
  }
}

export const defaultSocketPolicies: SocketPolicy[] = [
  socketPolicyAuthBuffer,
  socketPolicyConnectOnSend,
  socketPolicyLifecycle,
]
