import {on, ms, always, call, randomId, sleep, ago, now} from "@welshman/lib"
import {RELAY_JOIN, StampedEvent, SignedEvent, Filter, neverFilter} from "@welshman/util"
import {
  ClientMessage,
  isClientAuth,
  isClientClose,
  isClientEvent,
  isClientReq,
  isClientCount,
  isClientNegOpen,
  isClientNegClose,
  ClientMessageType,
  RelayMessage,
  copyPriority,
  isRelayOk,
  isRelayEose,
  isRelayClosed,
  isRelayNegErr,
  isRelayCount,
  matchReason,
  RelayReasonPrefix,
} from "./message.js"
import {Socket, SocketStatus, SocketEvent, SocketPolicy} from "./socket.js"
import {AuthStatus, AuthStateEvent} from "./auth.js"
import {catchUpFilter} from "./util.js"

/**
 * Handles auth-related message management:
 * - Remembers messages sent before auth completes so they can be replayed once it succeeds
 * - Withholds the relay's auth-required refusals of those messages from the caller, since the
 *   replay will be answered instead
 * - Hands a withheld answer over if the replay never happens: auth failed, or the message fell
 *   out of the buffer
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyAuthBuffer = (socket: Socket) => {
  const {None, Ok, DeniedSignature, Forbidden} = AuthStatus
  const terminalStatuses = [Ok, DeniedSignature, Forbidden]

  // Messages by req/event id, oldest first. Most relays never ask for auth, so this fills
  // with everything a socket sends; the relay answering a message is what takes it back out.
  const buffer = new Map<string, ClientMessage>()

  // Relay messages kept from the caller because a replay will answer them again
  const withheld = new Map<string, RelayMessage[]>()

  const getId = (message: ClientMessage) =>
    isClientEvent(message) ? message[1].id : (message[1] as string)

  const withhold = (id: string, message: RelayMessage) => {
    socket._recvQueue.remove(message)
    withheld.set(id, [...(withheld.get(id) || []), message])
  }

  // Give the caller whatever the relay told us about a message we are no longer going to replay
  const release = (id: string) => {
    const messages = withheld.get(id) || []

    buffer.delete(id)
    withheld.delete(id)

    for (const message of messages) {
      socket.receive(message)
    }
  }

  const unsubscribers = [
    on(socket, SocketEvent.Sending, (message: ClientMessage) => {
      // Always allow sending auth
      if (isClientAuth(message)) return

      // Always allow sending join requests
      if (isClientEvent(message) && message[1].kind === RELAY_JOIN) return

      // If the auth flow is complete, no need to buffer anymore
      if (terminalStatuses.includes(socket.auth.status)) return

      const isClose = isClientClose(message) || isClientNegClose(message)
      const isOpen =
        isClientReq(message) ||
        isClientCount(message) ||
        isClientEvent(message) ||
        isClientNegOpen(message)

      // A close ends the subscription, and anything else supersedes an earlier copy of itself,
      // as when a subscription is sent again after a reconnect. Anything else (NEG-MSG) belongs
      // to a session that replaying its NEG-OPEN starts over.
      if (isClose || isOpen) {
        const id = getId(message)

        buffer.delete(id)
        withheld.delete(id)

        if (isOpen) {
          buffer.set(id, message)
        }
      }

      while (buffer.size > 1000) {
        release(buffer.keys().next().value!)
      }
    }),
    on(socket, SocketEvent.Receiving, (message: RelayMessage) => {
      const id = message[1] as string

      // Only a message we can replay or answer later may be kept from the caller
      if (buffer.has(id)) {
        const isRefusal =
          ((isRelayClosed(message) || isRelayNegErr(message)) &&
            matchReason(RelayReasonPrefix.AuthRequired, message[2])) ||
          (isRelayOk(message) &&
            !message[2] &&
            matchReason(RelayReasonPrefix.AuthRequired, message[3]))

        if (isRefusal) {
          withhold(id, message)
        } else if (isRelayEose(message) && ![None, Ok].includes(socket.auth.status)) {
          // Wait for the replay's eose, since events may be withheld until we authenticate
          withhold(id, message)
        } else if (
          isRelayClosed(message) ||
          isRelayNegErr(message) ||
          isRelayOk(message) ||
          isRelayCount(message)
        ) {
          // The relay has answered for good, so there is nothing left to replay
          buffer.delete(id)
          withheld.delete(id)
        }
      }
    }),
    on(socket.auth, AuthStateEvent.Status, (status: AuthStatus) => {
      // Send buffered messages when we get successful auth. If auth failed, let the caller
      // hear the refusals we held back.
      if (status === Ok) {
        const messages = Array.from(buffer.values())

        buffer.clear()
        withheld.clear()

        for (const message of messages) {
          socket.send(message)
        }
      } else if (terminalStatuses.includes(status)) {
        for (const id of Array.from(buffer.keys())) {
          release(id)
        }
      }
    }),
  ]

  return () => unsubscribers.forEach(call)
}

/**
 * Drops subscriptions that are closed before they've been sent, along with the close
 * message itself. Besides saving a round trip, this keeps a prioritized close from
 * jumping ahead of its own req, which would leave the subscription open on the relay.
 * @param socket - a Socket object
 * @return a cleanup function
 */
export const socketPolicyCancelUnsent = (socket: Socket) => {
  const unsubscribers = [
    on(socket, SocketEvent.Sending, (message: ClientMessage) => {
      let isSubscription: (message: ClientMessage) => boolean

      if (isClientClose(message)) {
        isSubscription = isClientReq
      } else if (isClientNegClose(message)) {
        isSubscription = isClientNegOpen
      } else {
        return
      }

      const subscription = socket._sendQueue.items.find(
        other => isSubscription(other) && other[1] === message[1],
      )

      // The close is already queued at this point, so drop it along with the req
      if (subscription) {
        socket._sendQueue.remove(subscription)
        socket._sendQueue.remove(message)
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

              // Rebuilding the message drops its priority symbol, so carry it over
              socket.send(copyPriority([...message.slice(0, 2), ...filters], message))
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
  socketPolicyCancelUnsent,
  socketPolicyConnectOnSend,
  socketPolicyLifecycle,
]
