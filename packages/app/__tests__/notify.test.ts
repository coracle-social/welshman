import {describe, expect, it, vi, afterEach} from "vitest"
import {Socket, SocketEvent} from "@welshman/net"
import type {RelayMessage} from "@welshman/net"
import {App} from "../src/app.js"
import {Notify} from "../src/plugins/notify.js"

vi.mock("isomorphic-ws", () => ({
  default: {close: vi.fn(), send: vi.fn(), onopen: vi.fn()},
}))

const receive = (socket: Socket, message: RelayMessage) =>
  socket.emit(SocketEvent.Receive, message, socket.url)

describe("Notify", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("keeps the latest NOTIFY per relay", () => {
    const plugin = new App().use(Notify)
    const socket = new Socket("wss://one.relay/")

    plugin.monitorSocket(socket)

    receive(socket, ["NOTIFY", "your payment failed"])

    expect(plugin.get("wss://one.relay/")?.message).toBe("your payment failed")

    receive(socket, ["NOTIFY", "your membership lapsed"])

    expect(plugin.get("wss://one.relay/")?.message).toBe("your membership lapsed")

    socket.cleanup()
  })

  it("keys messages by the relay that sent them", () => {
    const plugin = new App().use(Notify)
    const one = new Socket("wss://one.relay/")
    const two = new Socket("wss://two.relay/")

    plugin.monitorSocket(one)
    plugin.monitorSocket(two)

    receive(one, ["NOTIFY", "from one"])
    receive(two, ["NOTIFY", "from two"])

    expect(plugin.get("wss://one.relay/")?.message).toBe("from one")
    expect(plugin.get("wss://two.relay/")?.message).toBe("from two")

    one.cleanup()
    two.cleanup()
  })

  it("ignores every other verb", () => {
    const plugin = new App().use(Notify)
    const socket = new Socket("wss://one.relay/")

    plugin.monitorSocket(socket)

    receive(socket, ["NOTICE", "a notice is not a notify"])
    receive(socket, ["EOSE", "sub"])

    expect(plugin.get("wss://one.relay/")).toBeUndefined()

    socket.cleanup()
  })

  it("stops listening once the socket is released", () => {
    const plugin = new App().use(Notify)
    const socket = new Socket("wss://one.relay/")

    plugin.monitorSocket(socket)()

    receive(socket, ["NOTIFY", "too late"])

    expect(plugin.get("wss://one.relay/")).toBeUndefined()

    socket.cleanup()
  })
})
