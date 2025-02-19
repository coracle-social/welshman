import {ctx, sleep} from "@welshman/lib"
import {CLIENT_AUTH, createEvent} from "@welshman/util"
import {ConnectionEvent} from "./ConnectionEvent.js"
import type {Connection} from "./Connection.js"
import type {Message} from "./Socket.js"

export enum AuthMode {
  Implicit = "implicit",
  Explicit = "explicit",
}

export enum AuthStatus {
  None = "none",
  Requested = "requested",
  PendingSignature = "pending_signature",
  DeniedSignature = "denied_signature",
  PendingResponse = "pending_response",
  Forbidden = "forbidden",
  Ok = "ok",
}

const {None, Requested, PendingSignature, DeniedSignature, PendingResponse, Forbidden, Ok} =
  AuthStatus

export class ConnectionAuth {
  challenge: string | undefined
  request: string | undefined
  message: string | undefined
  status = None

  constructor(readonly cxn: Connection) {
    this.cxn.on(ConnectionEvent.Close, this.#onClose)
    this.cxn.on(ConnectionEvent.Receive, this.#onReceive)
  }

  #onReceive = (cxn: Connection, [verb, ...extra]: Message) => {
    if (verb === "OK") {
      const [id, ok, message] = extra

      if (id === this.request) {
        this.message = message
        this.status = ok ? Ok : Forbidden
      }
    }

    if (verb === "AUTH" && extra[0] !== this.challenge) {
      this.challenge = extra[0]
      this.request = undefined
      this.message = undefined
      this.status = Requested

      if (ctx.net.authMode === AuthMode.Implicit) {
        this.respond()
      }
    }
  }

  #onClose = (cxn: Connection) => {
    this.challenge = undefined
    this.request = undefined
    this.message = undefined
    this.status = None
  }

  waitFor = async (condition: () => boolean, timeout = 300) => {
    const start = Date.now()

    while (Date.now() - timeout <= start) {
      if (condition()) {
        break
      }
      await sleep(Math.min(100, Math.ceil(timeout / 3)))
    }
  }

  waitForChallenge = async (timeout = 300) => this.waitFor(() => Boolean(this.challenge), timeout)

  waitForResolution = async (timeout = 300) =>
    this.waitFor(() => [None, DeniedSignature, Forbidden, Ok].includes(this.status), timeout)

  respond = async () => {
    if (!this.challenge) {
      throw new Error("Attempted to authenticate with no challenge")
    }

    if (this.status !== Requested) {
      throw new Error(`Attempted to authenticate when auth is already ${this.status}`)
    }

    this.status = PendingSignature

    const template = createEvent(CLIENT_AUTH, {
      tags: [
        ["relay", this.cxn.url],
        ["challenge", this.challenge],
      ],
    })

    const [event] = await Promise.all([ctx.net.signEvent(template), this.cxn.socket.open()])

    if (event) {
      this.request = event.id
      this.cxn.send(["AUTH", event])
      this.status = PendingResponse
    } else {
      this.status = DeniedSignature
    }
  }

  attempt = async (timeout = 300) => {
    await this.cxn.socket.open()
    await this.waitForChallenge(Math.ceil(timeout / 2))

    if (this.status === Requested) {
      await this.respond()
    }

    await this.waitForResolution(Math.ceil(timeout / 2))
  }
}
