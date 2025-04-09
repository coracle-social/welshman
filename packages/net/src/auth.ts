import EventEmitter from "events"
import {on, poll, call} from "@welshman/lib"
import {SignedEvent, StampedEvent} from "@welshman/util"
import {makeEvent, CLIENT_AUTH} from "@welshman/util"
import {isRelayAuth, isClientAuth, isRelayOk, RelayMessage} from "./message.js"
import {Socket, SocketStatus, SocketEvent} from "./socket.js"
import {Unsubscriber} from "./util.js"

export const makeAuthEvent = (url: string, challenge: string) =>
  makeEvent(CLIENT_AUTH, {
    tags: [
      ["relay", url],
      ["challenge", challenge],
    ],
  })

export enum AuthStatus {
  None = "auth:status:none",
  Requested = "auth:status:requested",
  PendingSignature = "auth:status:pending_signature",
  DeniedSignature = "auth:status:denied_signature",
  PendingResponse = "auth:status:pending_response",
  Forbidden = "auth:status:forbidden",
  Ok = "auth:status:ok",
}

export type AuthResult = {
  ok: boolean
  reason?: string
}

export enum AuthStateEvent {
  Status = "auth:event:status",
}

export type AuthStateEvents = {
  [AuthStateEvent.Status]: (status: AuthStatus) => void
}

export class AuthState extends EventEmitter {
  challenge: string | undefined
  request: string | undefined
  details: string | undefined
  status = AuthStatus.None
  _unsubscribers: Unsubscriber[] = []

  constructor(readonly socket: Socket) {
    super()

    this._unsubscribers.push(
      on(socket, SocketEvent.Receive, (message: RelayMessage) => {
        if (isRelayOk(message)) {
          const [_, id, ok, details] = message

          if (id === this.request) {
            this.details = details

            if (ok) {
              this.setStatus(AuthStatus.Ok)
            } else {
              this.setStatus(AuthStatus.Forbidden)
            }
          }
        }

        if (isRelayAuth(message)) {
          const [_, challenge] = message

          // Sometimes relays send the same challenge multiple times, no need to
          // respond to it twice
          if (challenge !== this.challenge) {
            this.challenge = challenge
            this.request = undefined
            this.details = undefined
            this.setStatus(AuthStatus.Requested)
          }
        }
      }),
      on(socket, SocketEvent.Sending, (message: RelayMessage) => {
        if (isClientAuth(message)) {
          this.setStatus(AuthStatus.PendingResponse)
        }
      }),
      on(socket, SocketEvent.Status, (status: SocketStatus) => {
        if (status === SocketStatus.Closed) {
          this.challenge = undefined
          this.request = undefined
          this.details = undefined
          this.setStatus(AuthStatus.None)
        }
      }),
    )
  }

  setStatus(status: AuthStatus) {
    this.status = status
    this.emit(AuthStateEvent.Status, status)
  }

  async doAuth(sign: (event: StampedEvent) => Promise<SignedEvent>) {
    if (!this.challenge) {
      throw new Error("Attempted to authenticate with no challenge")
    }

    if (this.status !== AuthStatus.Requested) {
      throw new Error(`Attempted to authenticate when auth is already ${this.status}`)
    }

    this.setStatus(AuthStatus.PendingSignature)

    const template = makeAuthEvent(this.socket.url, this.challenge)
    const event = await sign(template)

    if (event) {
      this.request = event.id
      this.socket.send(["AUTH", event])
    } else {
      this.setStatus(AuthStatus.DeniedSignature)
    }
  }

  async attemptAuth(sign: (event: StampedEvent) => Promise<SignedEvent>) {
    this.socket.attemptToOpen()

    await poll({
      signal: AbortSignal.timeout(800),
      condition: () => this.status === AuthStatus.Requested,
    })

    if (this.status === AuthStatus.Requested) {
      await this.doAuth(sign)
    }

    await poll({
      signal: AbortSignal.timeout(800),
      condition: () => this.status !== AuthStatus.PendingResponse,
    })
  }

  cleanup() {
    this.removeAllListeners()
    this._unsubscribers.forEach(call)
  }
}
