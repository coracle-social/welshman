import {describe, it, expect} from "vitest"
import {CLIENT_AUTH} from "@welshman/util"
import {SocketEvent, isClientAuth} from "@welshman/net"
import type {ClientMessage, RelayMessage, Socket} from "@welshman/net"
import {Nip01Signer} from "@welshman/signer"
import {App} from "../src/app.js"
import {User} from "../src/user.js"
import {defaultAppPolicies} from "../src/policy.js"

const url = "wss://localhost:1/"

const makeApp = async () => {
  const user = await User.fromSigner(Nip01Signer.ephemeral())

  return {user, app: new App({user, policies: defaultAppPolicies})}
}

// Deliver a message the way Socket's onmessage handler does — onto the rate limited
// recv queue, and synchronously to anything watching Receiving
const receive = (socket: Socket, message: RelayMessage) => {
  socket._recvQueue.push(message)
  socket.emit(SocketEvent.Receiving, message, socket.url)
}

const collectAuth = (socket: Socket) => {
  const sent: ClientMessage[] = []

  socket.on(SocketEvent.Sending, (message: ClientMessage) => sent.push(message))

  return () => sent.filter(isClientAuth)
}

const tick = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))

describe("auth policy", () => {
  it("answers a challenge with the signer the policies left in place", async () => {
    const {user, app} = await makeApp()
    const socket = app.pool.get(url)
    const getAuth = collectAuth(socket)

    receive(socket, ["AUTH", "challenge"])

    await tick()

    // The policies wrap user.signer, so an auth policy holding a detached reference to the
    // signer it saw at construction signs with the wrong receiver. AuthState runs signing
    // through tryCatch, so that failure surfaces as nothing being sent at all.
    const auth = getAuth()

    expect(auth.length).toBe(1)
    expect(auth[0][1].kind).toBe(CLIENT_AUTH)
    expect(auth[0][1].pubkey).toBe(user.pubkey)

    app.cleanup()
  })

  it("answers a challenge without waiting for the recv queue to drain", async () => {
    const {app} = await makeApp()
    const socket = app.pool.get(url)
    const getAuth = collectAuth(socket)

    // A relay that issues its challenge in response to a restricted req lands it behind
    // whatever it has already streamed. The queue only drains 20 messages per 100ms, so
    // reading the challenge off it costs a second per 200 messages ahead of it.
    for (let i = 0; i < 2000; i++) {
      receive(socket, ["NOTICE", String(i)])
    }

    receive(socket, ["AUTH", "challenge"])

    await tick()

    expect(getAuth().length).toBe(1)

    app.cleanup()
  })
})
