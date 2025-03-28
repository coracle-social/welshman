import {on, call, sleep, spec, ago, now} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  isClientReq,
  ClientMessageType,
  RelayMessage,
  isRelayOk,
  isRelayClosed,
} from "./message.js"
import {Socket, SocketStatus, SocketEventType} from "./socket.js"
import {AuthState, AuthStatus, AuthStateEventType} from "./auth.js"

/**
 * Defers sending messages when a challenge has been presented and not answered yet
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyDeferOnAuth = (socket: Socket) => {
  const buffer: ClientMessage[] = []
  const authState = new AuthState(socket)
  const okStatuses = [AuthStatus.None, AuthStatus.Ok]

  const unsubscribers = [
    // Pause sending certain messages when we're not authenticated
    on(socket, SocketEventType.Enqueue, (message: ClientMessage) => {
      // If we're closing a request, but it never got sent, remove both from the queue
      // Otherwise, always send CLOSE
      if (isClientClose(message)) {
        const req = buffer.find(spec([ClientMessageType.Req, message[1]]))

        if (req) {
          socket._sendQueue.remove(req)
          socket._sendQueue.remove(message)
        }

        return
      }

      // Always allow sending auth
      if (isClientAuth(message)) return

      // Always allow sending join requests
      if (isClientEvent(message) && message[1].kind === AUTH_JOIN) return

      // If we're not ok, remove the message and save it for later
      if (!okStatuses.includes(authState.status)) {
        buffer.push(message)
        socket._sendQueue.remove(message)
      }
    }),
    // Send buffered messages when we get successful auth
    on(authState, AuthStateEventType.Status, (status: AuthStatus) => {
      if (okStatuses.includes(status) && buffer.length > 0) {
        for (const message of buffer.splice(0)) {
          socket.send(message)
        }
      }
    }),
  ]

  return () => {
    unsubscribers.forEach(call)
    authState.cleanup()
  }
}

/**
 * Re-enqueues event/req messages once if rejected due to auth-required
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyRetryAuthRequired = (socket: Socket) => {
  const retried = new Set<string>()
  const pending = new Map<string, ClientMessage>()

  const unsubscribers = [
    // Watch outgoing events and requests and keep a copy
    on(socket, SocketEventType.Send, (message: ClientMessage) => {
      if (isClientEvent(message)) {
        const [_, event] = message

        if (!retried.has(event.id) && event.kind !== AUTH_JOIN) {
          pending.set(event.id, message)
        }
      }

      if (isClientReq(message)) {
        const [_, id] = message

        if (!retried.has(id)) {
          pending.set(id, message)
        }
      }
    }),
    // If a message is rejected with auth-required, re-enqueue it one time
    on(socket, SocketEventType.Receive, (message: RelayMessage) => {
      if (isRelayOk(message)) {
        const [_, id, ok, detail] = message
        const pendingMessage = pending.get(id)

        if (pendingMessage && !ok && detail?.startsWith("auth-required:")) {
          socket.send(pendingMessage)
          retried.add(id)
        }

        pending.delete(id)
      }

      if (isRelayClosed(message)) {
        const [_, id, detail] = message
        const pendingMessage = pending.get(id)

        if (pendingMessage && detail?.startsWith("auth-required:")) {
          socket.send(pendingMessage)
          retried.add(id)
        }

        pending.delete(id)
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
  let currentStatus = SocketStatus.Closed

  const unsubscribers = [
    on(socket, SocketEventType.Status, (newStatus: SocketStatus) => {
      // Keep track of the most recent error
      if (newStatus === SocketStatus.Error) {
        lastError = now()
      }

      // Keep track of the current status
      currentStatus = newStatus
    }),
    on(socket, SocketEventType.Enqueue, (message: ClientMessage) => {
      // When a new message is sent, make sure the socket is open (unless there was a recent error)
      if (currentStatus === SocketStatus.Closed && lastError < ago(30)) {
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
    on(socket, SocketEventType.Send, (message: ClientMessage) => {
      lastActivity = now()
    }),
    on(socket, SocketEventType.Receive, (message: RelayMessage) => {
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

  let lastOpen = 0

  const unsubscribers = [
    on(socket, SocketEventType.Status, (newStatus: SocketStatus) => {
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
    on(socket, SocketEventType.Send, (message: ClientMessage) => {
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
    on(socket, SocketEventType.Receive, (message: RelayMessage) => {
      if (isRelayClosed(message) || isRelayOk(message)) {
        pending.delete(message[1])
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
}

export const defaultSocketPolicies = [
  socketPolicyDeferOnAuth,
  socketPolicyRetryAuthRequired,
  socketPolicyConnectOnSend,
  socketPolicyCloseOnTimeout,
  socketPolicyReopenActive,
]
