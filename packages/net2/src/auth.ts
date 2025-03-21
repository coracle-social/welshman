import {on, sleep} from "@welshman/lib"
import type {SignedEvent, StampedEvent} from "@welshman/util"
import {makeEvent, CLIENT_AUTH} from "@welshman/util"
import {isRelayAuthMessage, isRelayOkMessage, RelayMessage} from "./message.js"
import {Socket, SocketStatus, SocketEventType, SocketUnsubscriber} from "./socket.js"

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

export type AuthManagerOptions = {
  sign: (event: StampedEvent) => Promise<SignedEvent>
  eager?: boolean
}

export class AuthManager {
  challenge: string | undefined
  request: string | undefined
  details: string | undefined
  status = AuthStatus.None
  _unsubscribers: SocketUnsubscriber[] = []

  constructor(
    readonly socket: Socket,
    readonly options: AuthManagerOptions,
  ) {
    this._unsubscribers.push(
      on(socket, SocketEventType.Receive, (message: RelayMessage) => {
        if (isRelayOkMessage(message)) {
          const [_, id, ok, details] = message

          if (id === this.request) {
            this.details = details

            if (ok) {
              this.status = AuthStatus.Ok
            } else {
              this.status = AuthStatus.Forbidden
            }
          }
        }

        if (isRelayAuthMessage(message)) {
          const [_, challenge] = message

          this.challenge = challenge
          this.request = undefined
          this.details = undefined
          this.status = AuthStatus.Requested

          if (this.options.eager) {
            this.respond()
          }
        }
      }),
    )

    this._unsubscribers.push(
      on(socket, SocketEventType.Status, (status: SocketStatus) => {
        if (status === SocketStatus.Closed) {
          this.challenge = undefined
          this.request = undefined
          this.details = undefined
          this.status = AuthStatus.None
        }
      }),
    )
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
    await this.waitFor(() => Boolean(this.challenge), timeout)
  }

  async waitForResolution(timeout = 300) {
    await this.waitFor(
      () =>
        [AuthStatus.None, AuthStatus.DeniedSignature, AuthStatus.Forbidden, AuthStatus.Ok].includes(
          this.status,
        ),
      timeout,
    )
  }

  async attempt(timeout = 300) {
    await this.socket.attemptToOpen()
    await this.waitForChallenge(Math.ceil(timeout / 2))

    if (this.status === AuthStatus.Requested) {
      await this.respond()
    }

    await this.waitForResolution(Math.ceil(timeout / 2))
  }

  async respond() {
    if (!this.challenge) {
      throw new Error("Attempted to authenticate with no challenge")
    }

    if (this.status !== AuthStatus.Requested) {
      throw new Error(`Attempted to authenticate when auth is already ${this.status}`)
    }

    this.status = AuthStatus.PendingSignature

    const template = makeAuthEvent(this.socket.url, this.challenge)
    const event = await this.options.sign(template)

    if (event) {
      this.request = event.id
      this.socket.send(["AUTH", event])
      this.status = AuthStatus.PendingResponse
    } else {
      this.status = AuthStatus.DeniedSignature
    }
  }

  cleanup() {
    for (const cb of this._unsubscribers) {
      cb()
    }
  }
}
