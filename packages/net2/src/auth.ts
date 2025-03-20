import type {SignedEvent} from "@welshman/util"
import {makeEvent, CLIENT_AUTH} from "@welshman/util"
import type {ISocket} from "./socket.js"

export const makeAuthEvent = (url: string, challenge: string) =>
  makeEvent(CLIENT_AUTH, {
    tags: [
      ["relay", url],
      ["challenge", challenge],
    ],
  })

export type AuthResult = {
  ok: boolean
  reason?: string
}

export const authenticate = (socket: ISocket, event: SignedEvent) =>
  new Promise(resolve => {
    socket.send(["AUTH", event])

    socket.onOk(([id, ok = false, reason = ""]) => {
      if (id === event.id) resolve({ok, reason})
    })
  })
