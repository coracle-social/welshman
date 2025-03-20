import type {SignedEvent} from "@welshman/util"

// relay -> client

export enum RelayMessageType {
  Auth = "AUTH",
  Event = "EVENT",
  Eose = "EOSE",
  Ok = "OK",
}

export type RelayAuthPayload = [string]

export type RelayEventPayload = [string, SignedEvent]

export type RelayEosePayload = [string, SignedEvent]

export type RelayOkPayload = [string, boolean, string]

export type RelayAuthMessage = ["AUTH", ...RelayAuthPayload]

export type RelayEventMessage = ["EVENT", ...RelayEventPayload]

export type RelayEoseMessage = ["EOSE", ...RelayEosePayload]

export type RelayOkMessage = ["OK", ...RelayOkPayload]

export type RelayMessage = any[]

export const isRelayAuthMessage = (m: RelayMessage): m is RelayAuthMessage =>
  m[0] === RelayMessageType.Auth

export const isRelayEventMessage = (m: RelayMessage): m is RelayEventMessage =>
  m[0] === RelayMessageType.Event

export const isRelayEoseMessage = (m: RelayMessage): m is RelayEoseMessage =>
  m[0] === RelayMessageType.Eose

export const isRelayOkMessage = (m: RelayMessage): m is RelayOkMessage =>
  m[0] === RelayMessageType.Ok

// client -> relay

export type ClientMessage = any[]
