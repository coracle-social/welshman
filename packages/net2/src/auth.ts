import type {WebSocketSubject} from "rxjs/websocket"
import {Subject} from "rxjs"
import type {SignedEvent} from "@welshman/util"
import {createEvent, CLIENT_AUTH} from "@welshman/util"
import type {SocketResponse} from "./socket.js"

export const createAuthEvent = (url: string, challenge: string) =>
  createEvent(CLIENT_AUTH, {
    tags: [
      ["relay", url],
      ["challenge", challenge],
    ],
  })

export type AuthResult = {
  ok: boolean
  reason?: string
}

export const authenticate = (socket: WebSocketSubject<SocketResponse>, event: SignedEvent) => {
  const subject = new Subject<AuthResult>()

  socket.next(["AUTH", event])

  socket.subscribe(message => {
    if (message[0] === "OK") {
      const [id, ok = false, reason = ""] = message.slice(1)

      if (id === event.id) {
        subject.next({ok, reason})
      }
    }
  })

  return subject
}

export const forceAuth = <T>(socket: WebSocketSubject<T>) => {}
