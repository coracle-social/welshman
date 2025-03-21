import type {SignedEvent} from "@welshman/util"

// relay -> client

export enum RelayMessageType {
  Auth = "AUTH",
  Eose = "EOSE",
  Event = "EVENT",
  NegErr = "NEG-ERR",
  NegMsg = "NEG-MSG",
  Ok = "OK",
}

export type RelayAuthPayload = [string]

export type RelayEosePayload = [string, SignedEvent]

export type RelayEventPayload = [string, SignedEvent]

export type RelayNegErrPayload = [string, string]

export type RelayNegMsgPayload = [string, string]

export type RelayOkPayload = [string, boolean, string]

export type RelayAuthMessage = [RelayMessageType.Auth, ...RelayAuthPayload]

export type RelayEoseMessage = [RelayMessageType.Eose, ...RelayEosePayload]

export type RelayEventMessage = [RelayMessageType.Event, ...RelayEventPayload]

export type RelayNegErrMessage = [RelayMessageType.NegErr, ...RelayNegErrPayload]

export type RelayNegMsgMessage = [RelayMessageType.NegMsg, ...RelayNegMsgPayload]

export type RelayOkMessage = [RelayMessageType.Ok, ...RelayOkPayload]

export type RelayMessage = any[]

export const isRelayAuthMessage = (m: RelayMessage): m is RelayAuthMessage =>
  m[0] === RelayMessageType.Auth

export const isRelayEoseMessage = (m: RelayMessage): m is RelayEoseMessage =>
  m[0] === RelayMessageType.Eose

export const isRelayEventMessage = (m: RelayMessage): m is RelayEventMessage =>
  m[0] === RelayMessageType.Event

export const isRelayNegErrMessage = (m: RelayMessage): m is RelayNegErrMessage =>
  m[0] === RelayMessageType.NegErr

export const isRelayNegMsgMessage = (m: RelayMessage): m is RelayNegMsgMessage =>
  m[0] === RelayMessageType.NegMsg

export const isRelayOkMessage = (m: RelayMessage): m is RelayOkMessage =>
  m[0] === RelayMessageType.Ok

// client -> relay

export type ClientMessage = any[]

export enum ClientMessageType {
  Auth = "AUTH",
  Event = "EVENT",
  NegClose = "NEG-CLOSE",
  Req = "REQ",
}
