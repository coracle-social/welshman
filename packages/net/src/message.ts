import type {SignedEvent, Filter} from "@welshman/util"

// relay -> client

export enum RelayMessageType {
  Auth = "AUTH",
  Closed = "CLOSED",
  Eose = "EOSE",
  Event = "EVENT",
  NegErr = "NEG-ERR",
  NegMsg = "NEG-MSG",
  Ok = "OK",
}

export type RelayMessage = any[]

export type RelayAuthPayload = [string]

export type RelayClosedPayload = [string, string]

export type RelayEosePayload = [string]

export type RelayEventPayload = [string, SignedEvent]

export type RelayNegErrPayload = [string, string]

export type RelayNegMsgPayload = [string, string]

export type RelayOkPayload = [string, boolean, string]

export type RelayAuth = [RelayMessageType.Auth, ...RelayAuthPayload]

export type RelayClosed = [RelayMessageType.Closed, ...RelayClosedPayload]

export type RelayEose = [RelayMessageType.Eose, ...RelayEosePayload]

export type RelayEvent = [RelayMessageType.Event, ...RelayEventPayload]

export type RelayNegErr = [RelayMessageType.NegErr, ...RelayNegErrPayload]

export type RelayNegMsg = [RelayMessageType.NegMsg, ...RelayNegMsgPayload]

export type RelayOk = [RelayMessageType.Ok, ...RelayOkPayload]

export const isRelayAuth = (m: RelayMessage): m is RelayAuth => m[0] === RelayMessageType.Auth

export const isRelayClosed = (m: RelayMessage): m is RelayClosed => m[0] === RelayMessageType.Closed

export const isRelayEose = (m: RelayMessage): m is RelayEose => m[0] === RelayMessageType.Eose

export const isRelayEvent = (m: RelayMessage): m is RelayEvent => m[0] === RelayMessageType.Event

export const isRelayNegErr = (m: RelayMessage): m is RelayNegErr => m[0] === RelayMessageType.NegErr

export const isRelayNegMsg = (m: RelayMessage): m is RelayNegMsg => m[0] === RelayMessageType.NegMsg

export const isRelayOk = (m: RelayMessage): m is RelayOk => m[0] === RelayMessageType.Ok

// client -> relay

export enum ClientMessageType {
  Auth = "AUTH",
  Close = "CLOSE",
  Event = "EVENT",
  NegClose = "NEG-CLOSE",
  NegOpen = "NEG-OPEN",
  Req = "REQ",
}

export type ClientMessage = any[]

export type ClientAuthPayload = [string]

export type ClientClosePayload = [string]

export type ClientEventPayload = [SignedEvent]

export type ClientNegClosePayload = [string]

export type ClientNegOpenPayload = [string, Filter, string]

export type ClientReqPayload = [string, Filter]

export type ClientAuth = [ClientMessageType.Auth, ...ClientAuthPayload]

export type ClientClose = [ClientMessageType.Close, ...ClientClosePayload]

export type ClientEvent = [ClientMessageType.Event, ...ClientEventPayload]

export type ClientNegClose = [ClientMessageType.NegClose, ...ClientNegClosePayload]

export type ClientNegOpen = [ClientMessageType.NegOpen, ...ClientNegOpenPayload]

export type ClientReq = [ClientMessageType.Req, ...ClientReqPayload]

export const isClientAuth = (m: ClientMessage): m is ClientAuth => m[0] === ClientMessageType.Auth

export const isClientClose = (m: ClientMessage): m is ClientClose =>
  m[0] === ClientMessageType.Close

export const isClientEvent = (m: ClientMessage): m is ClientEvent =>
  m[0] === ClientMessageType.Event

export const isClientNegClose = (m: ClientMessage): m is ClientNegClose =>
  m[0] === ClientMessageType.NegClose

export const isClientNegOpen = (m: ClientMessage): m is ClientNegOpen =>
  m[0] === ClientMessageType.NegOpen

export const isClientReq = (m: ClientMessage): m is ClientReq => m[0] === ClientMessageType.Req
