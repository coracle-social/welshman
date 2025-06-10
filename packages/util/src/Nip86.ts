import {postJson} from "@welshman/lib"
import {SignedEvent} from "./Events.js"
import {makeHttpAuthHeader} from "./Nip98.js"

export enum ManagementMethod {
  SupportedMethods = "supportedmethods",
  BanPubkey = "banpubkey",
  AllowPubkey = "allowpubkey",
  ListBannedPubkeys = "listbannedpubkeys",
  ListAllowedPubkeys = "listallowedpubkeys",
  ListEventsNeedingModeration = "listeventsneedingmoderation",
  AllowEvent = "allowevent",
  BanEvent = "banevent",
  ListBannedEvents = "listbannedevents",
  ChangeRelayName = "changerelayname",
  ChangeRelayDescription = "changerelaydescription",
  ChangeRelayIcon = "changerelayicon",
  AllowKind = "allowkind",
  DisallowKind = "disallowkind",
  ListAllowedKinds = "listallowedkinds",
  BlockIp = "blockip",
  UnblockIp = "unblockip",
  ListBlockedIps = "listblockedips",
}

export type ManagementRequest = {
  method: ManagementMethod
  params: string[]
}

export const sendManagementRequest = (
  url: string,
  request: ManagementRequest,
  authEvent: SignedEvent,
) =>
  postJson(url, request, {
    headers: {
      "Content-Type": "application/nostr+json+rpc",
      Authorization: makeHttpAuthHeader(authEvent),
    },
  })
