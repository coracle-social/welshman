export enum ConnectionEvent {
  InvalidUrl = "invalid:url",
  InvalidMessage = "invalid:message:receive",
  Open = "socket:open",
  Reset = "socket:reset",
  Close = "socket:close",
  Error = "socket:error",
  Receive = "receive:message",
  Notice = "receive:notice",
  Send = "send:message",
}
