import EventEmitter from "events"
import {on, call, sleep} from "@welshman/lib"
import type {SignedEvent, StampedEvent} from "@welshman/util"
import {makeEvent, CLIENT_AUTH} from "@welshman/util"
import {isRelayAuth, isClientAuth, isRelayOk, RelayMessage} from "./message.js"
import {Socket, SocketStatus, SocketEventType} from "./socket.js"
import {TypedEmitter, Unsubscriber} from "./util.js"

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

export enum AuthStateEventType {
  Status = "auth:state:event:status",
}

export type AuthStateEvents = {
  [AuthStateEventType.Status]: (status: AuthStatus) => void
}

export class AuthState extends (EventEmitter as new () => TypedEmitter<AuthStateEvents>) {
  challenge: string | undefined
  request: string | undefined
  details: string | undefined
  status = AuthStatus.None
  _unsubscribers: Unsubscriber[] = []

  constructor(readonly socket: Socket) {
    super()

    this._unsubscribers.push(
      on(socket, SocketEventType.Receive, (message: RelayMessage) => {
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

          this.challenge = challenge
          this.request = undefined
          this.details = undefined
          this.setStatus(AuthStatus.Requested)
        }
      }),
    )

    this._unsubscribers.push(
      on(socket, SocketEventType.Enqueue, (message: RelayMessage) => {
        if (isClientAuth(message)) {
          this.setStatus(AuthStatus.PendingResponse)
        }
      }),
    )

    this._unsubscribers.push(
      on(socket, SocketEventType.Status, (status: SocketStatus) => {
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
    this.emit(AuthStateEventType.Status, status)
  }

  cleanup() {
    this.removeAllListeners()
    this._unsubscribers.forEach(call)
  }
}

export type AuthManagerOptions = {
  sign: (event: StampedEvent) => Promise<SignedEvent>
  eager?: boolean
}

export class AuthManager {
  state: AuthState

  constructor(
    readonly socket: Socket,
    readonly options: AuthManagerOptions,
  ) {
    this.state = new AuthState(socket)
    this.state.on(AuthStateEventType.Status, (status: string) => {
      if (status === AuthStatus.Requested && options.eager) {
        this.respond()
      }
    })
  }

  async waitFor(condition: () => boolean, timeout = 300) {
    const start = Date.now()

    while (Date.now() - timeout <= start) {
      if (condition()) {
        break
      }

      await sleep(Math.min(100, Math.ceil(timeout / 3)))
    }
  }

  async waitForChallenge(timeout = 300) {
    await this.waitFor(() => Boolean(this.state.challenge), timeout)
  }

  async waitForResolution(timeout = 300) {
    await this.waitFor(
      () =>
        [AuthStatus.None, AuthStatus.DeniedSignature, AuthStatus.Forbidden, AuthStatus.Ok].includes(
          this.state.status,
        ),
      timeout,
    )
  }

  async attempt(timeout = 300) {
    await this.socket.attemptToOpen()
    await this.waitForChallenge(Math.ceil(timeout / 2))

    if (this.state.status === AuthStatus.Requested) {
      await this.respond()
    }

    await this.waitForResolution(Math.ceil(timeout / 2))
  }

  async respond() {
    if (!this.state.challenge) {
      throw new Error("Attempted to authenticate with no challenge")
    }

    if (this.state.status !== AuthStatus.Requested) {
      throw new Error(`Attempted to authenticate when auth is already ${this.state.status}`)
    }

    this.state.setStatus(AuthStatus.PendingSignature)

    const template = makeAuthEvent(this.socket.url, this.state.challenge)
    const event = await this.options.sign(template)

    if (event) {
      this.state.request = event.id
      this.socket.send(["AUTH", event])
    } else {
      this.state.setStatus(AuthStatus.DeniedSignature)
    }
  }

  cleanup() {
    this.state.cleanup()
  }
}
