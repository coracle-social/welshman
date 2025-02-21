import {webSocket} from "rxjs/websocket"
import type {SignedEvent} from "@welshman/util"

export type SocketResponse =
  | ["AUTH", string]
  | ["EVENT", string, SignedEvent]
  | ["EOSE", string, SignedEvent]
  | ["OK", string, boolean, string]

export const connect = (url: string) => webSocket<SocketResponse>(url)
