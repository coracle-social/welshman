import {on, nthNe, always, call, sleep, ago, now} from "@welshman/lib"
import {AUTH_JOIN, StampedEvent, SignedEvent} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  isClientReq,
  isClientNegClose,
  RelayMessage,
  isRelayOk,
  isRelayEose,
  isRelayClosed,
} from "./message.js"
import {Socket, SocketStatus, SocketEvent} from "./socket.js"
import {AuthStatus, AuthStateEvent} from "./auth.js"

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
      if (isClientEvent(message) && message[1].kind === AUTH_JOIN) return

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
      // If the client is closing a request during auth, don't tell the caller, we'll retry it
      if (isRelayClosed(message) && message[2]?.startsWith("auth-required:")) {
        socket._recvQueue.remove(message)
      }

      // If we get an eose but we're in the middle of authenticating, wait
      if (isRelayEose(message) && ![None, Ok].includes(socket.auth.status)) {
        socket._recvQueue.remove(message)
      }

      // If the client is rejecting an event during auth, don't tell the caller, we'll retry it
      if (isRelayOk(message) && !message[2] && message[3]?.startsWith("auth-required:")) {
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
      // When a new message is sent, make sure the socket is open (unless there was a recent error)
      if (socket.status === SocketStatus.Closed && lastError < ago(30)) {
        socket.open()
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
}

/**
 * Auto-closes a socket after 30 seconds of inactivity
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyCloseOnTimeout = (socket: Socket) => {
  let lastActivity = now()

  const unsubscribers = [
    on(socket, SocketEvent.Send, (message: ClientMessage) => {
      lastActivity = now()
    }),
    on(socket, SocketEvent.Receive, (message: RelayMessage) => {
      lastActivity = now()
    }),
  ]

  const interval = setInterval(() => {
    if (socket.status === SocketStatus.Open && lastActivity < ago(30)) {
      socket.close()
    }
  }, 3000)

  return () => {
    unsubscribers.forEach(call)
    clearInterval(interval)
  }
}

/**
 * Automatically re-opens a socket if there are active requests or publishes
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyReopenActive = (socket: Socket) => {
  const pending = new Map<string, ClientMessage>()

  let lastOpen = Date.now()

  const unsubscribers = [
    on(socket, SocketEvent.Status, (newStatus: SocketStatus) => {
      // Keep track of the most recent error
      if (newStatus === SocketStatus.Open) {
        lastOpen = Date.now()
      }

      // If the socket closed and we have no error, reopen it but don't flap
      if (newStatus === SocketStatus.Closed && pending.size) {
        sleep(Math.max(0, 30_000 - (Date.now() - lastOpen))).then(() => {
          for (const message of pending.values()) {
            socket.send(message)
          }
        })
      }
    }),
    on(socket, SocketEvent.Send, (message: ClientMessage) => {
      if (isClientEvent(message)) {
        pending.set(message[1].id, message)
      }

      if (isClientReq(message)) {
        pending.set(message[1], message)
      }

      if (isClientClose(message)) {
        pending.delete(message[1])
      }
    }),
    on(socket, SocketEvent.Receive, (message: RelayMessage) => {
      if (isRelayClosed(message) || isRelayOk(message)) {
        pending.delete(message[1])
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
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

export const defaultSocketPolicies = [
  socketPolicyAuthBuffer,
  socketPolicyConnectOnSend,
  socketPolicyCloseOnTimeout,
  socketPolicyReopenActive,
]
