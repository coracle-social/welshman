import {now} from "@welshman/lib"
import {SocketEvent, isRelayNotify} from "@welshman/net"
import type {RelayMessage, Socket} from "@welshman/net"
import {MapPlugin} from "./base.js"

export type NotifyItem = {
  url: string
  message: string
  receivedAt: number
}

/**
 * The latest NOTIFY message per relay url. A relay sends one to tell the
 * authenticated user something about their account — a failed payment, an
 * expiring membership — and replaces it by sending another, so only the most
 * recent one per relay is kept. A pure store; the socket wiring that fills it
 * lives in `appPolicyNotify`.
 *
 * The store is in memory. A relay may resend its latest message after every
 * AUTH, so anything that needs a message to stay dismissed persists that
 * itself.
 */
export class Notify extends MapPlugin<NotifyItem> {
  private onSocketReceive = (message: RelayMessage, url: string) => {
    if (isRelayNotify(message)) {
      this.set(url, {url, message: message[1], receivedAt: now()})
    }
  }

  monitorSocket = (socket: Socket) => {
    socket.on(SocketEvent.Receive, this.onSocketReceive)

    return () => {
      socket.off(SocketEvent.Receive, this.onSocketReceive)
    }
  }
}
