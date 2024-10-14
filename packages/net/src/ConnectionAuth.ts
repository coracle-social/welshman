import {ctx, sleep} from '@welshman/lib'
import {CLIENT_AUTH, createEvent} from '@welshman/util'
import type {Connection} from './Connection'
import type {SocketMessage} from './Socket'
import {asMessage} from './Socket'

export enum AuthMode {
  Implicit = 'implicit',
  Explicit = 'explicit',
}

export enum AuthStatus {
  None = 'none',
  Requested = 'requested',
  PendingSignature = 'pending_signature',
  DeniedSignature = 'denied_signature',
  PendingResponse = 'pending_response',
  Forbidden = 'forbidden',
  Ok = 'ok',
}

const {
  None,
  Requested,
  PendingSignature,
  DeniedSignature,
  PendingResponse,
  Forbidden,
  Ok,
} = AuthStatus

export class ConnectionAuth {
  challenge: string | undefined
  request: string | undefined
  message: string | undefined
  status = None

  constructor(readonly connection: Connection) {
    this.connection.on('receive', this.#onReceive)
  }

  #onReceive = (connection: Connection, message: SocketMessage) => {
    const [verb, ...extra] = asMessage(message)

    if (verb === 'OK') {
      const [id, ok, message] = extra

      if (id === this.request) {
        this.challenge = undefined
        this.request = undefined
        this.message = message
        this.status = ok ? Ok : Forbidden
      }
    }

    if (verb === 'AUTH' && extra[0] !== this.challenge) {
      this.challenge = extra[0]
      this.request = undefined
      this.message = undefined
      this.status = Requested

      if (ctx.net.authMode === AuthMode.Implicit) {
        this.attempt()
      }
    }
  }

  attempt = async () => {
    if (!this.challenge) {
      throw new Error("Attempted to authenticate with no challenge")
    }

    if (this.status !== Requested) {
      throw new Error(`Attempted to authenticate when auth is already ${this.status}`)
    }

    this.status = PendingSignature

    const template = createEvent(CLIENT_AUTH, {
      tags: [
        ["relay", this.connection.url],
        ["challenge", this.challenge],
      ],
    })

    const [event] = await Promise.all([
      ctx.net.signEvent(template),
      this.connection.ensureConnected(),
    ])

    if (event) {
      this.request = event.id
      this.connection.send(['AUTH', event])
      this.status = PendingResponse
    } else {
      this.status = DeniedSignature
    }
  }

  attemptIfRequested = async () => {
    if (this.status === Requested) {
      await this.attempt()
    }
  }

  wait = async ({timeout = 3000}: {timeout?: number} = {}) => {
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
      await sleep(100)

      if ([None, Requested].includes(this.status)) {
        throw new Error("Auth flow reset while waiting for auth")
      }

      if ([DeniedSignature, Forbidden, Ok].includes(this.status)) {
        break
      }
    }
  }

  waitIfPending = async ({timeout = 3000}: {timeout?: number} = {}) => {
    if ([PendingSignature, PendingResponse].includes(this.status)) {
      await this.wait({timeout})
    }
  }

  destroy = () => {
    this.connection.off('recieve', this.#onReceive)
  }
}
