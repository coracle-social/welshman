import {filter, Subscription} from "rxjs"
import {sleep, nth, ago, now} from "@welshman/lib"
import {AUTH_JOIN} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  isClientReq,
  RelayMessage,
  isRelayOk,
  isRelayClosed,
} from "./message.js"
import {Socket, SocketStatus} from "./socket.js"
import {AuthState, AuthStatus} from "./auth.js"
import {pauseController} from "./util.js"

// Pause sending messages when the socket isn't open
export const socketPolicySendWhenOpen = (socket: Socket) => {
  const controller = pauseController<ClientMessage>()

  return {
    tx: [
      controller.operator,
      tap((status: SocketStatus) => {
        if (status === SocketStatus.Open) {
          controller.resume()
        } else {
          controller.pause()
        }
      }),
    ],
  }
}

export const socketPolicyDeferOnAuth = (socket: Socket) => {
  const send$ = socket.send$
  const buffer: ClientMessage[] = []
  const authState = new AuthState(socket)
  const okStatuses = [AuthStatus.None, AuthStatus.Ok]

  // Defer sending certain messages when we're not authenticated
  socket.send$ = send$.pipe(
    filter(message => {
      // Always allow sending auth
      if (isClientAuth(message)) return true

      // Always allow sending join requests
      if (isClientEvent(message) && message[1].kind === AUTH_JOIN) return true

      // If we're not ok, remove the message and save it for later
      if (!okStatuses.includes(authState.status)) {
        buffer.push(message)

        return false
      }

      return true
    }),
  )

  // Send buffered messages when we get successful auth
  return authState.subscribe((status: AuthStatus) => {
    if (okStatuses.includes(status)) {
      const reqs = new Set(buffer.filter(isClientReq).map(nth(1)))
      const closed = new Set(buffer.filter(isClientClose).map(nth(1)))

      for (const message of buffer.splice(0)) {
        // Skip requests that were closed before they were sent
        if (isClientReq(message) && closed.has(message[1])) continue

        // Skip closes for requests that were never sent
        if (isClientClose(message) && reqs.has(message[1])) continue

        socket.send(message)
      }
    }
  })
}

export const socketPolicyRetryAuthRequired = (socket: Socket) => {
  const retried = new Set<string>()
  const pending = new Map<string, ClientMessage>()
  const subscription = new Subscription()

  // Watch outgoing events and requests and keep a copy
  subscription.add(
    socket.send$.subscribe((message: ClientMessage) => {
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
  )

  // If a message is rejected with auth-required, re-enqueue it one time
  subscription.add(
    socket.recv$.subscribe((message: RelayMessage) => {
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
  )

  return subscription
}

export const socketPolicyConnectOnSend = (socket: Socket) => {
  const subscription = new Subscription()

  let lastError = 0
  let currentStatus = SocketStatus.Closed

  subscription.add(
    socket.status$.subscribe((newStatus: SocketStatus) => {
      // Keep track of the most recent error
      if (newStatus === SocketStatus.Error) {
        lastError = now()
      }

      // Keep track of the current status
      currentStatus = newStatus
    }),
  )

  subscription.add(
    socket.send$.subscribe(() => {
      // When a new message is sent, make sure the socket is open (delaying in case of a recent error)
      if (currentStatus === SocketStatus.Closed) {
        setTimeout(() => socket.open(), Math.max(0, 30 - (now() - lastError)))
      }
    }),
  )

  return subscription
}

export const socketPolicyCloseOnTimeout = (socket: Socket) => {
  const subscription = new Subscription()

  let lastActivity = 0

  const interval = setInterval(() => {
    if (lastActivity < ago(30)) {
      socket.close()
    }
  }, 3000)

  subscription.add(
    socket.send$.subscribe(() => {
      lastActivity = now()
    }),
  )

  subscription.add(
    socket.recv$.subscribe({
      next: () => {
        lastActivity = now()
      },
      complete: () => {
        clearInterval(interval)
      },
    }),
  )

  return subscription
}

export const socketPolicyReopenActive = (socket: Socket) => {
  const subscription = new Subscription()
  const pending = new Map<string, ClientMessage>()

  let lastOpen = 0

  subscription.add(
    socket.status$.subscribe((newStatus: SocketStatus) => {
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
  )

  subscription.add(
    socket.send$.subscribe((message: ClientMessage) => {
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
  )

  subscription.add(
    socket.recv$.subscribe((message: RelayMessage) => {
      if (isRelayClosed(message) || isRelayOk(message)) {
        pending.delete(message[1])
      }
    }),
  )

  return subscription
}

export const defaultSocketPolicies = [
  socketPolicySendWhenOpen,
  socketPolicyDeferOnAuth,
  socketPolicyRetryAuthRequired,
  socketPolicyConnectOnSend,
  socketPolicyCloseOnTimeout,
  socketPolicyReopenActive,
]
