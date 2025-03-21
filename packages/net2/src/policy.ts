import {on, spec, ago, now} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  ClientMessageType,
} from "./message.js"
import {Socket, SocketStatus, SocketEventType} from "./socket.js"
import {AuthState, AuthStatus, AuthStateEventType} from "./auth.js"

// Pause sending messages when the socket isn't open
export const socketPolicySendWhenOpen = (socket: Socket) => {
  const unsubscribe = on(socket, SocketEventType.Status, (newStatus: SocketStatus) => {
    if (newStatus === SocketStatus.Open) {
      socket._sendQueue.start()
    } else {
      socket._sendQueue.stop()
    }
  })

  return unsubscribe
}

export const socketPolicyDeferOnAuth = (socket: Socket) => {
  const buffer: ClientMessage[] = []
  const authState = new AuthState(socket)
  const okStatuses = [AuthStatus.None, AuthStatus.Ok]

  // Pause sending certain messages when we're not authenticated
  const unsubscribeEnqueue = on(socket, SocketEventType.Enqueue, (message: ClientMessage) => {
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
  })

  // Send buffered messages when we get successful auth
  const unsubscribeAuthStatus = on(authState, AuthStateEventType.Status, (status: AuthStatus) => {
    if (okStatuses.includes(status) && buffer.length > 0) {
      for (const message of buffer.splice(0)) {
        socket.send(message)
      }
    }
  })

  return () => {
    unsubscribeAuthStatus()
    unsubscribeEnqueue()
    authState.cleanup()
  }
}

export const socketPolicyConnectOnSend = (socket: Socket) => {
  let lastError = 0
  let currentStatus = SocketStatus.Closed

  const unsubscribeOnStatus = on(socket, SocketEventType.Status, (newStatus: SocketStatus) => {
    // Keep track of the most recent error
    if (newStatus === SocketStatus.Error) {
      lastError = now()
    }

    // Keep track of the current status
    currentStatus = newStatus
  })

  const unsubscribeOnSend = on(socket, SocketEventType.Send, (message: ClientMessage) => {
    // When a new message is sent, make sure the socket is open (unless there was a recent error)
    if (currentStatus === SocketStatus.Closed && now() - lastError < ago(30)) {
      socket.open()
    }
  })

  return () => {
    unsubscribeOnStatus()
    unsubscribeOnSend()
  }
}

export const defaultSocketPolicies = [
  socketPolicySendWhenOpen,
  socketPolicyDeferOnAuth,
  socketPolicyConnectOnSend,
]
